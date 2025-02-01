# OpenProject Jira Migration Tool

A tool to migrate issues from Jira to OpenProject, including attachments, comments, relationships, and priorities.

## Features

- Migrates issues with their descriptions, priorities, and statuses
- Preserves issue relationships and hierarchies
- Migrates attachments and comments
- Migrates watchers
- Maps Jira users to OpenProject users
- Tracks original Jira issue IDs
- Handles incremental migrations

## Prerequisites

1. Node.js installed
2. Access to both Jira and OpenProject instances
3. API tokens/keys for both systems
4. Custom field in OpenProject to store Jira issue IDs

## Setup

1. Clone this repository
2. Run `npm install` to install dependencies
3. Copy `.env.example` to `.env`
4. Configure your environment variables in `.env`

### Environment Variables

#### Jira Configuration
- `JIRA_HOST`: Your Jira instance hostname (e.g., your-domain.atlassian.net)
- `JIRA_EMAIL`: Your Jira email address
- `JIRA_API_TOKEN`: Your Jira API token (generate at https://id.atlassian.com/manage-profile/security/api-tokens)

#### OpenProject Configuration
- `OPENPROJECT_HOST`: Your OpenProject instance URL
- `OPENPROJECT_API_KEY`: Your OpenProject API key (generate in Settings > My account > Access token)

#### Custom Field Configuration
- `JIRA_ID_CUSTOM_FIELD`: The ID of the custom field in OpenProject that stores the Jira issue ID
  - This must be a text custom field
  - Find the ID in OpenProject: Administration > Custom fields > Work packages
  - Default value is 1 if not specified

### OpenProject Custom Field Setup

1. In OpenProject, go to Administration > Custom fields > Work packages
2. Create a new text custom field (if not already exists)
3. Note the ID of the custom field
4. Set this ID in your `.env` file as `JIRA_ID_CUSTOM_FIELD`

## Usage

Run the migration tool:

```bash
node migrate.js
```

Follow the interactive prompts to:
1. Select source Jira project
2. Select target OpenProject project
3. Choose migration type (full or specific issues)
4. Confirm existing issue handling

For non-interactive usage or specific issues:

```bash
# Migrate specific issues
node migrate.js JIRA_PROJECT_KEY OPENPROJECT_ID ISSUE1,ISSUE2

# Migrate relationships only
node migrate-relationships.js JIRA_PROJECT_KEY OPENPROJECT_ID

# Remove duplicate work packages
node remove-duplicates.js OPENPROJECT_ID
```

## Troubleshooting

If you encounter issues:

1. Check your API tokens and permissions
2. Verify the custom field ID is correct
3. Ensure users are properly mapped
4. Check the console output for detailed error messages

## About

This project was built by [EliteCoders](https://www.elitecoders.co), a software development company specializing in custom software solutions. If you need help with:

- Custom software development
- System integration
- Migration tools and services
- Technical consulting

Please reach out to us at hello@elitecoders.co or visit our website at [www.elitecoders.co](https://www.elitecoders.co).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](LICENSE) - see the [LICENSE](LICENSE) file for details. 