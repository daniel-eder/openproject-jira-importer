require("dotenv").config();
const axios = require("axios");
const path = require("path");
const fs = require("fs");

// Jira API configuration
const jiraConfig = {
  baseURL: `https://${process.env.JIRA_HOST}/rest/api/3`,
  auth: {
    username: process.env.JIRA_EMAIL,
    password: process.env.JIRA_API_TOKEN,
  },
};

const jiraApi = axios.create(jiraConfig);

// Create a download client without default content-type
const downloadClient = axios.create({
  ...jiraConfig,
  responseType: "arraybuffer",
});

const DEFAULT_FIELDS = [
  "summary",
  "description",
  "status",
  "priority",
  "issuetype",
  "attachment",
  "comment",
  "issuelinks",
  "assignee",
  "customfield_10014", // Epic Link field
  "parent",
].join(",");

async function getAllJiraIssues(projectKey, fields = DEFAULT_FIELDS) {
  try {
    let allIssues = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      console.log(`Fetching issues ${startAt} to ${startAt + maxResults}...`);
      const response = await jiraApi.get("/search", {
        params: {
          jql: `project = ${projectKey} ORDER BY created DESC`,
          startAt,
          maxResults,
          fields,
          expand: "renderedFields",
        },
      });

      const { issues, total } = response.data;
      allIssues = allIssues.concat(issues);

      if (allIssues.length >= total || issues.length === 0) {
        console.log(`Retrieved all ${allIssues.length} issues`);
        break;
      }

      startAt += maxResults;
    }

    return allIssues;
  } catch (error) {
    console.error("Error fetching Jira issues:", error.message);
    throw error;
  }
}

async function getSpecificJiraIssues(
  projectKey,
  issueKeys,
  fields = DEFAULT_FIELDS
) {
  try {
    console.log(`Fetching specific issues: ${issueKeys.join(", ")}...`);
    const response = await jiraApi.get("/search", {
      params: {
        jql: `key in (${issueKeys.join(",")})`,
        maxResults: issueKeys.length,
        fields,
        expand: "renderedFields",
      },
    });
    return response.data.issues;
  } catch (error) {
    console.error("Error fetching specific Jira issues:", error.message);
    throw error;
  }
}

async function getJiraUserEmail(accountId) {
  try {
    console.log(`Fetching email for Jira user with accountId: ${accountId}`);
    const response = await jiraApi.get(`/user/properties/email`, {
      params: {
        accountId: accountId,
      },
    });
    console.log("Jira API response:", response.data);
    return response.data.value;
  } catch (error) {
    console.error("Error fetching Jira user email:", error.message);
    return null;
  }
}

async function downloadAttachment(url, filePath) {
  try {
    const response = await downloadClient.get(url);
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(filePath, response.data);
    return filePath;
  } catch (error) {
    console.error(`Error downloading attachment: ${error.message}`);
    return null;
  }
}

async function listProjects() {
  try {
    const response = await jiraApi.get("/project");
    return response.data;
  } catch (error) {
    console.error("Error fetching Jira projects:", error.message);
    throw error;
  }
}

module.exports = {
  getAllJiraIssues,
  getSpecificJiraIssues,
  getJiraUserEmail,
  downloadAttachment,
  listProjects,
  DEFAULT_FIELDS,
};
