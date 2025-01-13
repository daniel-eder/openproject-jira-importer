require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// OpenProject API configuration
const openProjectConfig = {
  baseURL: `${process.env.OPENPROJECT_HOST}/api/v3`,
  headers: {
    Authorization: `Basic ${Buffer.from(
      `apikey:${process.env.OPENPROJECT_API_KEY}`
    ).toString("base64")}`,
    "Content-Type": "application/json",
  },
};

const openProjectApi = axios.create(openProjectConfig);

// Known custom field ID for JIRA ID
const JIRA_ID_CUSTOM_FIELD = 1;

// Store work package types and statuses
let workPackageTypes = null;
let workPackageStatuses = null;
let openProjectUsers = null;

// Map Jira issue types to OpenProject types
const typeMapping = {
  Task: "Task",
  Story: "User story",
  Bug: "Bug",
  Epic: "Epic",
  Feature: "Feature",
  Milestone: "Milestone",
};

// Map Jira statuses to OpenProject statuses
const statusMapping = {
  "To Do": "New",
  "In Progress": "In progress",
  Done: "Closed",
  Closed: "Closed",
  Resolved: "Closed",
};

async function getOpenProjectWorkPackages(projectId) {
  console.log("\n=== Caching OpenProject Work Packages ===");
  console.log("Fetching work packages from OpenProject...");

  let allWorkPackages = [];
  let page = 1;
  const pageSize = 100;
  let total = null;
  const workPackageMap = new Map();

  while (true) {
    console.log(`Fetching page ${page}...`);

    try {
      const response = await openProjectApi.get("/work_packages", {
        params: {
          filters: JSON.stringify([
            {
              project: {
                operator: "=",
                values: [projectId.toString()],
              },
            },
          ]),
          offset: page,
          pageSize: pageSize,
          sortBy: JSON.stringify([["id", "asc"]]),
        },
      });

      if (total === null) {
        total = parseInt(response.data.total);
        console.log(`Total work packages to fetch: ${total}`);
      }

      const workPackages = response.data._embedded.elements;
      if (!workPackages || workPackages.length === 0) {
        break;
      }

      // Log the first work package to see its structure
      if (page === 1) {
        console.log("\nExample work package structure:");
        console.log(JSON.stringify(workPackages[0], null, 2));
      }

      allWorkPackages = allWorkPackages.concat(workPackages);
      console.log(
        `Retrieved ${
          allWorkPackages.length
        } of ${total} work packages (${Math.round(
          (allWorkPackages.length / total) * 100
        )}%)`
      );

      // Map work packages by their Jira ID
      for (const wp of workPackages) {
        const jiraId = wp.customField1;
        if (jiraId) {
          workPackageMap.set(jiraId, wp);
        }
      }

      if (allWorkPackages.length >= total) {
        break;
      }

      page++;
      // Add a small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error("Error fetching work packages:", error.message);
      throw error;
    }
  }

  console.log(
    `\nTotal work packages found in OpenProject: ${allWorkPackages.length}`
  );

  // Log cache summary
  const withJiraId = Array.from(workPackageMap.keys()).length;
  const withoutJiraId = allWorkPackages.length - withJiraId;
  console.log("\nCache Summary:");
  console.log(`- Total work packages: ${allWorkPackages.length}`);
  console.log(`- Work packages with Jira ID: ${withJiraId}`);
  console.log(`- Work packages without Jira ID: ${withoutJiraId}`);
  console.log(`- Cached ${withJiraId} work packages for quick lookup`);
  console.log("=======================================\n");

  return workPackageMap;
}

async function setParentWorkPackage(childId, parentId) {
  try {
    // Get current work package to get its lock version
    const currentWP = await openProjectApi.get(`/work_packages/${childId}`);

    await openProjectApi.patch(`/work_packages/${childId}`, {
      lockVersion: currentWP.data.lockVersion,
      _links: {
        parent: {
          href: `/api/v3/work_packages/${parentId}`,
        },
      },
    });
  } catch (error) {
    console.error(
      `Error setting parent for work package ${childId}:`,
      error.message
    );
    if (error.response?.data) {
      console.error(
        "Error details:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw error;
  }
}

async function createWorkPackage(projectId, payload) {
  try {
    const response = await openProjectApi.post("/work_packages", {
      ...payload,
      _links: {
        ...payload._links,
        project: {
          href: `/api/v3/projects/${projectId}`,
        },
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating work package:", error.message);
    throw error;
  }
}

async function updateWorkPackage(workPackageId, payload) {
  try {
    // Get current work package to get its lock version
    const currentWP = await openProjectApi.get(
      `/work_packages/${workPackageId}`
    );

    // Remove _type from update payload and add lock version
    const { _type, ...updatePayload } = payload;
    updatePayload.lockVersion = currentWP.data.lockVersion;

    const response = await openProjectApi.patch(
      `/work_packages/${workPackageId}`,
      updatePayload
    );
    return response.data;
  } catch (error) {
    console.error(
      `Error updating work package ${workPackageId}:`,
      error.message
    );
    if (error.response?.data) {
      console.error(
        "Error details:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    throw error;
  }
}

async function addComment(workPackageId, comment) {
  try {
    await openProjectApi.post(`/work_packages/${workPackageId}/activities`, {
      comment: {
        raw: Buffer.from(comment).toString("utf8"),
      },
    });
  } catch (error) {
    console.error(
      `Error adding comment to work package ${workPackageId}:`,
      error.message
    );
    throw error;
  }
}

async function uploadAttachment(workPackageId, filePath, fileName, mimeType) {
  try {
    const formData = new FormData();
    formData.append("metadata", JSON.stringify({ fileName }));
    formData.append("file", fs.createReadStream(filePath));

    const response = await openProjectApi.post(
      `/work_packages/${workPackageId}/attachments`,
      formData,
      {
        headers: {
          ...openProjectConfig.headers,
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      `Error uploading attachment to work package ${workPackageId}:`,
      error.message
    );
    throw error;
  }
}

async function listProjects() {
  try {
    const response = await openProjectApi.get("/projects");
    console.log("\nAvailable OpenProject Projects:");
    response.data._embedded.elements.forEach((project) => {
      console.log(`- ID: ${project.id}, Name: ${project.name}`);
    });
    return response.data._embedded.elements;
  } catch (error) {
    console.error("Error listing projects:", error.message);
    throw error;
  }
}

async function getWorkPackageTypes() {
  try {
    const response = await openProjectApi.get("/types");
    workPackageTypes = response.data._embedded.elements;
    console.log("\nAvailable work package types:");
    workPackageTypes.forEach((type) => {
      console.log(`- ${type.name} (ID: ${type.id})`);
    });
    return workPackageTypes;
  } catch (error) {
    console.error("Error fetching work package types:", error.message);
    throw error;
  }
}

async function getWorkPackageStatuses() {
  try {
    const response = await openProjectApi.get("/statuses");
    workPackageStatuses = response.data._embedded.elements;
    console.log("\nAvailable work package statuses:");
    workPackageStatuses.forEach((status) => {
      console.log(`- ${status.name} (ID: ${status.id})`);
    });
    return workPackageStatuses;
  } catch (error) {
    console.error("Error fetching work package statuses:", error.message);
    throw error;
  }
}

function getWorkPackageTypeId(jiraIssueType) {
  console.log(`Mapping Jira type: ${jiraIssueType}`);
  const mappedType = typeMapping[jiraIssueType] || "Task"; // Default to Task if no mapping found
  const typeObj = workPackageTypes.find(
    (t) => t.name.toLowerCase() === mappedType.toLowerCase()
  );
  if (!typeObj) {
    console.warn(
      `Could not find OpenProject type for ${jiraIssueType} (mapped to ${mappedType})`
    );
    return workPackageTypes[0].id;
  }
  console.log(
    `Mapped to OpenProject type: ${typeObj.name} (ID: ${typeObj.id})`
  );
  return typeObj.id;
}

function getWorkPackageStatusId(jiraStatus) {
  console.log(`Mapping Jira status: ${jiraStatus}`);
  const mappedStatus = statusMapping[jiraStatus] || "New"; // Default to New if no mapping found
  const statusObj = workPackageStatuses.find(
    (s) => s.name.toLowerCase() === mappedStatus.toLowerCase()
  );
  if (!statusObj) {
    console.warn(
      `Could not find OpenProject status for ${jiraStatus} (mapped to ${mappedStatus})`
    );
    return workPackageStatuses[0].id; // Default to first status
  }
  console.log(
    `Mapped to OpenProject status: ${statusObj.name} (ID: ${statusObj.id})`
  );
  return statusObj.id;
}

async function getExistingAttachments(workPackageId) {
  try {
    const response = await openProjectApi.get(
      `/work_packages/${workPackageId}/attachments`
    );
    return response.data._embedded.elements;
  } catch (error) {
    console.error(`Error getting existing attachments: ${error.message}`);
    return [];
  }
}

async function getExistingComments(workPackageId) {
  try {
    const response = await openProjectApi.get(
      `/work_packages/${workPackageId}/activities`
    );
    return response.data._embedded.elements.filter((e) => e.comment?.raw);
  } catch (error) {
    console.error(`Error getting existing comments: ${error.message}`);
    return [];
  }
}

async function getOpenProjectUsers() {
  try {
    const response = await openProjectApi.get("/users");
    openProjectUsers = response.data._embedded.elements;
    console.log("\nAvailable OpenProject users:");
    openProjectUsers.forEach((user) => {
      console.log(`- ${user.name} (ID: ${user.id}, Email: ${user.email})`);
    });
    return openProjectUsers;
  } catch (error) {
    console.error("Error fetching OpenProject users:", error.message);
    throw error;
  }
}

async function findExistingWorkPackage(jiraKey, projectId) {
  try {
    const response = await openProjectApi.get("/work_packages", {
      params: {
        filters: JSON.stringify([
          { project: { operator: "=", values: [projectId.toString()] } },
          {
            [`customField${JIRA_ID_CUSTOM_FIELD}`]: {
              operator: "=",
              values: [jiraKey],
            },
          },
        ]),
      },
    });

    const workPackages = response.data._embedded.elements;
    return workPackages.length > 0 ? workPackages[0] : null;
  } catch (error) {
    console.error(`Error finding existing work package: ${error.message}`);
    if (error.response?.data) {
      console.error(
        "Error details:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    return null;
  }
}

function getWorkPackageTypeName(typeId) {
  const type = workPackageTypes?.find((t) => t.id === typeId);
  return type ? type.name : "Unknown";
}

function getWorkPackageStatusName(statusId) {
  const status = workPackageStatuses?.find((s) => s.id === statusId);
  return status ? status.name : "Unknown";
}

module.exports = {
  getOpenProjectWorkPackages,
  setParentWorkPackage,
  createWorkPackage,
  updateWorkPackage,
  addComment,
  uploadAttachment,
  listProjects,
  getWorkPackageTypes,
  getWorkPackageStatuses,
  getWorkPackageTypeId,
  getWorkPackageStatusId,
  getExistingAttachments,
  getExistingComments,
  getOpenProjectUsers,
  findExistingWorkPackage,
  getWorkPackageTypeName,
  getWorkPackageStatusName,
  typeMapping,
  statusMapping,
  JIRA_ID_CUSTOM_FIELD,
};
