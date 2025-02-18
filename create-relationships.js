require("dotenv").config();
const axios = require("axios");

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

// Store issue key to work package ID mapping
const issueToWorkPackageMap = new Map();

// Track missing relationships to retry later
const missingRelationships = new Set();

async function checkExistingRelationship(fromId, toId, type) {
  try {
    console.log(
      `\nChecking for existing relationship: ${fromId} ${type} ${toId}`
    );
    // Use the relations endpoint with filters
    const response = await openProjectApi.get("/relations", {
      params: {
        filters: JSON.stringify([
          {
            from: {
              operator: "=",
              values: [fromId.toString()],
            },
            to: {
              operator: "=",
              values: [toId.toString()],
            },
            type: {
              operator: "=",
              values: [type],
            },
          },
        ]),
      },
    });

    // Log the API response for debugging
    console.log("API Response:", JSON.stringify(response.data, null, 2));

    // If we find any relations matching our criteria, a relationship exists
    const exists = response.data.total > 0;
    console.log(
      `Relationship exists: ${exists} (found ${response.data.total} matches)`
    );

    return exists;
  } catch (error) {
    console.error(`Error checking existing relationship: ${error.message}`);
    if (error.response?.data) {
      console.error(
        "Error details:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    return false;
  }
}

async function createRelationship(fromId, toId, type) {
  try {
    console.log(
      `\nAttempting to create relationship: ${fromId} ${type} ${toId}`
    );

    // Check if relationship already exists
    const exists = await checkExistingRelationship(fromId, toId, type);
    if (exists) {
      console.log(
        `Relationship already exists: ${type} from ${fromId} to ${toId}`
      );
      return;
    }

    // Create new relationship
    const payload = {
      type: type,
      description: "Created by Jira migration",
      lag: 0,
      _links: {
        to: {
          href: `/api/v3/work_packages/${toId}`,
        },
      },
    };

    console.log(
      "Creating relationship with payload:",
      JSON.stringify(payload, null, 2)
    );

    // The correct endpoint is /api/v3/work_packages/{id}/relations
    const response = await openProjectApi.post(
      `/work_packages/${fromId}/relations`,
      payload
    );
    console.log("Creation response:", JSON.stringify(response.data, null, 2));
    console.log(`Created ${type} relationship: ${fromId} -> ${toId}`);
  } catch (error) {
    console.error(
      `Error creating relationship: ${fromId} -> ${toId} ${type} ${error.message}`
    );
    if (error.response?.data) {
      console.error(
        "Error details:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
  }
}

async function handleRelationships(issue) {
  if (!issue.fields.issuelinks && !issue.fields.customfield_10014) return;

  const fromWorkPackageId = issueToWorkPackageMap.get(issue.key);
  if (!fromWorkPackageId) return;

  // Handle epic link first
  if (issue.fields.customfield_10014) {
    const epicKey = issue.fields.customfield_10014;
    const epicWorkPackageId = issueToWorkPackageMap.get(epicKey);
    if (epicWorkPackageId) {
      await createRelationship(fromWorkPackageId, epicWorkPackageId, "partof");
    } else {
      console.log(
        `Epic ${epicKey} not found in current migration batch, will retry later`
      );
      missingRelationships.add(
        JSON.stringify({
          fromKey: issue.key,
          toKey: epicKey,
          type: "partof",
        })
      );
    }
  }

  // Handle regular issue links
  if (!issue.fields.issuelinks || issue.fields.issuelinks.length === 0) return;

  for (const link of issue.fields.issuelinks) {
    let relatedIssueKey;
    let relationType;
    let shouldSkip = false;

    if (link.outwardIssue) {
      relatedIssueKey = link.outwardIssue.key;
      switch (link.type.outward) {
        case "blocks":
          relationType = "blocks";
          break;
        case "relates to":
          relationType = "relates";
          break;
        case "is parent of":
          relationType = "includes";
          break;
        case "duplicates":
          // For duplicates, only create the relationship if this is the newer issue
          relationType = "duplicates";
          // Skip if we've already processed this pair in the other direction
          shouldSkip = issue.fields.created > link.outwardIssue.fields?.created;
          break;
        default:
          relationType = "relates";
      }
    } else if (link.inwardIssue) {
      relatedIssueKey = link.inwardIssue.key;
      switch (link.type.inward) {
        case "is blocked by":
          relationType = "blocked";
          break;
        case "relates to":
          relationType = "relates";
          break;
        case "is child of":
          relationType = "partof";
          break;
        case "is duplicated by":
          // For duplicates, only create the relationship if this is the newer issue
          relationType = "duplicated";
          // Skip if we've already processed this pair in the other direction
          shouldSkip = issue.fields.created < link.inwardIssue.fields?.created;
          break;
        default:
          relationType = "relates";
      }
    }

    if (shouldSkip) {
      console.log(
        `Skipping duplicate relationship for ${issue.key} to avoid circular dependency`
      );
      continue;
    }

    const toWorkPackageId = issueToWorkPackageMap.get(relatedIssueKey);
    if (toWorkPackageId) {
      try {
        await createRelationship(
          fromWorkPackageId,
          toWorkPackageId,
          relationType
        );
      } catch (error) {
        console.error(
          `Failed to create relationship: ${issue.key} ${relationType} ${relatedIssueKey}`
        );
        // Store failed relationship to retry
        missingRelationships.add(
          JSON.stringify({
            fromKey: issue.key,
            toKey: relatedIssueKey,
            type: relationType,
          })
        );
      }
    } else {
      console.log(
        `Skipping relationship: Target issue ${relatedIssueKey} not found in current migration batch`
      );
      // Store missing relationship to retry
      missingRelationships.add(
        JSON.stringify({
          fromKey: issue.key,
          toKey: relatedIssueKey,
          type: relationType,
        })
      );
    }
  }
}

async function retryMissingRelationships() {
  if (missingRelationships.size === 0) return;

  console.log(
    `\nRetrying ${missingRelationships.size} missing relationships...`
  );
  const retryRelationships = Array.from(missingRelationships).map((r) =>
    JSON.parse(r)
  );
  missingRelationships.clear();

  for (const rel of retryRelationships) {
    const fromWorkPackageId = issueToWorkPackageMap.get(rel.fromKey);
    const toWorkPackageId = issueToWorkPackageMap.get(rel.toKey);

    if (fromWorkPackageId && toWorkPackageId) {
      try {
        await createRelationship(fromWorkPackageId, toWorkPackageId, rel.type);
        console.log(
          `Created relationship: ${rel.fromKey} ${rel.type} ${rel.toKey}`
        );
      } catch (error) {
        console.error(
          `Failed to create relationship: ${rel.fromKey} ${rel.type} ${rel.toKey}`
        );
      }
    } else {
      console.log(
        `Still missing work package for relationship: ${rel.fromKey} ${rel.type} ${rel.toKey}`
      );
    }
  }
}

async function createRelationships(issues, issueKeyToWorkPackageIdMap) {
  try {
    console.log("\n=== Creating Relationships ===");

    // Update the mapping with provided data
    for (const [key, id] of Object.entries(issueKeyToWorkPackageIdMap)) {
      issueToWorkPackageMap.set(key, id);
    }

    // First pass: Create all relationships
    for (const issue of issues) {
      await handleRelationships(issue);
    }

    // Final pass: Retry any missing relationships
    await retryMissingRelationships();

    console.log("\n=== Relationship Creation Complete ===");
  } catch (error) {
    console.error("\nRelationship creation failed:", error.message);
  }
}

module.exports = { createRelationships };
