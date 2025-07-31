# Project Manager
This is a custom project and specification management tool designed to help freelancers organize their work based on robust and living product specification. The product specification is a dynamic document that evolves during the project lifecycle and is intended as the primary source of truth. The "Project Manager" is designed to integrate with Github Projects.

## Requirements

### Platform Requirements
 - the "Project Manager" is a web application built with React with TypeScript and Vite, and Firebase
 - Initially, Firebase is used only for admin authentication
 - it is hosted locally as a Docker container
 - it uses the Github API to manage issues and projects

### Login Page and First Time User Experience
 - The login page is a simple login page that allows the user to log in with their Github account.
 - When logging for the first time, the user should provide an authentication token for access to the Github APIs.
 - After logging in, the user is redirected to the project management dashboard.
 - If the user is not logged in, they are redirected to the login page.

## User Types

The "Project Manager" has the following types of users:
 - **Admin**: full access to all features, can manage users and projects

## User Stories

 - As an admin, I want to be able to create projects and manage their specifications.


## The Product Specification
The product specification is a living document that evolves during the project lifecycle. It is intended to be the primary source of truth for the project and should be updated regularly as the project progresses. It has the following features:
### Structure
- It is based on Github issues and sub-issues, so it retains the same properties as Github issues.
- Each issue can have a title, description, a state, a type and a github repository.
- The type of the issue is mapped to github issue labels.
- Issue type
- The top-level issues are the main features or modules of the project.
- Each top-level issue can have sub-issues that represent smaller tasks or components of the feature.
- Each sub-issue can have its own sub-issues, allowing for a hierarchical structure.
- Each parent issue is has a level of completeness, which is calculated based on the completion of its sub-issues.
- An issue can have three states: "To Do", "In Progress", and "Done".
- A parent issue can be set as "Done" only automatically, and when all its sub-issues are in the "Done" state.
- An issue, created in the product specification, is automatically created in the Github projects.
- A sub-issue created in the product specification is automatically created in the Github projects as a sub-issue of the parent issue.
- Each issue has a unique identifier that is used to link it to the Github issue.
- A leaf issue is an issue that has no sub-issues.
- A leaf issue represents a task that can be worked on independently.
- When a leaf issue is marked as "In Progress", a new branch is created in that issue's repository with the Id of the issue as the branch name.
- A leaf issue can be marked as "Done" manually by the admin.
- When a leaf issue is marked as "Done", the corresponding branch is merged into the main branch and the issue branch is deleted.
- If a top-level issue has a child or grandchild sub-issue with the "In Progress" state, the top-level issue is automatically set to "In Progress".
### UI
- The product specification is displayed as a nested list of issues and sub-issues.
- Each nested level can be expanded or collapsed to show or hide its sub-issues.
- Each issue displays its Id, Title State and Completeness (as a discretely divided bar based on the count of its sub-issues, and filled based on the completion of its sub-issues).
- Upon clicking on an issue, a modal is opened with the issue details.
- At the end of each list (level) of issues there is a button to create a new issue at that level.
- The issue creation modal allows the user to enter the title, description, state, type and repository of the issue.
- an issue can be deleted or edited from it's details modal.

