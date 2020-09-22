# HootDat Backend

## Getting started

### Clone the repository

### Install dependencies

```bash
cd <project_name>
npm install
```

### Configure Postgres

Start the Postgres server and create a database called `hootdat` (you can change this).

### Configure the environment variables

First, create your `.env` file from the template.

```bash
cp .env.example .env
```

Then, modify `.env` to change configuration options. In particular, you might need to change the database username and/or password. If you used a different database name in the previous step, you also need to change the `TYPEORM_DATABASE` variable here.

### Build and run the project

```bash
npm run start
```

This will let `nodemon` observe file changes and automatically recompile the server as you modify the files.

You might also be interested in other `npm` scripts. Take a look at `package.json`.
