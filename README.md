# OpenThrone - NextJS Project
#### Forked from NextJs-Boilerplate by CreativeDesignsGuru

  
## Background
OpenThrone is a community project hoping to recreate the TextBased MMORPG called DarkThrone which has gone dark after almost 20years of service. While we are not affiliated with the original DarkThrone project, our community hopes to be able to deliver a game that can pick up where DT left off and bring forth many of the enhancements and hopes that we were patiently waiting for.

## Development Notes
OpenThrone started out as a fork of the Dark Curse project which was originally started by Moppler (Matt Gibney) here: https://github.com/MattGibney/DarkCurse. This project has been archived and is no longer being updated. We've since decided to port it to NextJS/React, while trying to keep a lot of the heavy lift that was already done previously from a design perspective.

## Game Status - PRE-ALPHA / LIVE DEVELOPMENT
There's currently a live server running at [OpenThrone.Dev](https://openthrone.dev), however it should be noted that at this time, this server is a live development server and will be reset often and sometimes without notice.

## FAQ
- Is the game still being actively developed?

Yes, a small group of volunteers have been working to get a working version of the game up and running.
- What can I do to help?

If you have experience with art, NextJS, or Figma please send a message to DasTacoMann.
- Is it helpful for me to tell you all my ideas for the game?

Currently we are hyper focused on getting the basic mechanics of the game functioning so there will be a time later where ideas can be talked about.

## Community
Join us on Discord here: https://discord.gg/j9NYxmBCjA

## Contributions
Contributions are the backbone of OpenThrone. Feel encouraged to report bugs or ask questions by opening an issue. We are open to all suggestions for improvement.
- Volunteering: We welcome volunteers skilled in art, NextJS, or Figma. Reach out to DasTacoMann to contribute.
- Ideation: While we appreciate your enthusiasm and ideas, our current focus is on foundational game mechanics. There will be opportunities to discuss new ideas once we have a stable version.

## Getting it running
A few notes about how to get the game running locally (for dev work or otherwise):

- Download the source: `git clone https://github.com/OpenThrone/OpenThrone && cd OpenThrone`
- Install the dependencies: `npm install` (you may need to use --legacy-peer-deps for this to complete successfully)
- Set up a postgresql user and database (this is beyond the scope of this documentation, but there are plenty of examples elsewhere on the web)
- Copy .env.sample with `cp .env.sample .env.local` and add your configuration to .env.local
- Run the prisma migrations: `npx prisma migrate dev --name init`
- Start the development server: `npm run bun-dev`

### Handling Updates from Upstream

When you pull the latest updates from the upstream repository, there may be new migrations, dependencies, or configuration changes. Follow these steps to ensure everything runs smoothly:

  

1.  **Pull the Latest Updates:**

```bash
git pull upstream main
```

  

2.  **Install New Dependencies:**

- If there are updates to `package.json`, you may need to install new dependencies:
```bash
npm install
```

  

3.  **Update the Database Schema:**

- If there are new Prisma migrations, run the following command to apply them:
```bash
npx prisma migrate dev
```
- This command will apply the latest migrations and sync your database schema with the code.

  

4.  **Rebuild the Project (if necessary):**

- If there are changes in TypeScript types or other build-related changes, you may need to rebuild the project:
```bash
npm run build
```

  

5.  **Restart the Development Server:**

- Ensure the server is restarted to pick up all changes:
```bash
npm run bun-dev
```
## Cron Jobs / Scheduled Tasks

To facilitate the job of providing a set of scheduled jobs, such as providing turns every 30minutes or new citizens every day, you'll have to use an external scheduler such as Crontab. The following will list out a number of tasks that can be scheduled

### Daily Citizens

 - crontab entry
```0 0 * * * /usr/bin/curl -X POST -H "Authorization: SECRET_KEY_FROM_ENV" https://<url>/api/cronJobs/daily```
- .env value to enable: ```DO_DAILY_UPDATES=true```

### 30minute turn and gold generation
- crontab entry
```0,30 * * * * /usr/bin/curl -X POST -H "Authorization: SECRET_KEY_FROM_ENV" https://<url>/api/cronJobs/turns```
- .env value to enable: ```DO_DAILY_UPDATES=true```

### .ENV Secrets
Make sure you update your secret in your .env file
```TASK_SECRET="TESTING"```

## Other Information
### VSCode information (optional)

If you are VSCode users, you can have a better integration with VSCode by installing the suggested extension in `.vscode/extension.json`. The starter code comes up with Settings for a seamless integration with VSCode. The Debug configuration is also provided for frontend and backend debugging experience.

With the plugins installed on your VSCode, ESLint and Prettier can automatically fix the code and show you the errors. Same goes for testing, you can install VSCode Jest extension to automatically run your tests and it also show the code coverage in context.

Pro tips: if you need a project wide type checking with TypeScript, you can run a build with <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> on Mac.


### License

Licensed under the MIT License, Copyright © 2023

See [LICENSE](LICENSE) for more information.