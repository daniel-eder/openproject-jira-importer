# Jira to OpenProject Issue Migrator

A Node.js script to migrate issues from Jira to OpenProject. This tool helps you seamlessly transfer your issues, including attachments, comments, and relationships.

## Features

- Migrates issue details (summary, description, status, type, priority)
- Transfers attachments and comments
- Preserves issue relationships
- Maps users between systems
- Supports selective migration of specific issues
- Handles incremental updates

## Prerequisites

- Node.js (v14 or higher) installed on your system
- Jira account with API token
- OpenProject instance with API access

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Configure your `.env` file with:
   - `JIRA_HOST`: Your Jira instance hostname (e.g., your-domain.atlassian.net)
   - `JIRA_EMAIL`: Your Jira account email
   - `JIRA_API_TOKEN`: Your Jira API token (generate from Atlassian account settings)
   - `OPENPROJECT_HOST`: Your OpenProject instance URL
   - `OPENPROJECT_API_KEY`: Your OpenProject API key (generate from OpenProject admin settings)

## Usage

### 1. Generate User Mapping

First, generate a mapping between Jira and OpenProject users:

```bash
node generate-user-mapping.js
```

This will:
1. Fetch users from both systems
2. Help you map users between systems
3. Save the mapping to `user-mapping.js`

### 2. Migrate Projects

To start the migration process:

```bash
node migrate.js
```

The script will guide you through the following steps:
1. Select the source Jira project
2. Select the target OpenProject project
3. Choose the migration type:
   - Full migration: Migrates all issues
   - Test migration: Simulates migration without making changes
   - Specific issues: Migrate only selected issues
4. For full migrations, choose how to handle existing issues:
   - Add new issues only (skip existing)
   - Add new issues and update existing ones

You can also run the migration with command line arguments:
```bash
node migrate.js JIRA_PROJECT_KEY OPENPROJECT_ID [--prod] [--skip-updates] [--specific ISSUE1,ISSUE2]
```

### 3. Migrate Parent-Child Relationships

After migrating issues, set up parent-child relationships:

```bash
node migrate-parents.js
```

### 4. Migrate Issue Relationships

Finally, migrate issue relationships (blocks, relates to, etc.):

```bash
node migrate-relationships.js
```

### 5. Clean Up Duplicates (Optional)

If you need to clean up any duplicate issues:

```bash
node remove-duplicates.js
```

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