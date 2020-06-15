# Personal Site

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/ldiego73/ldiego73.github.io/blob/develop/LICENSE)
[![Personal Site](https://github.com/ldiego73/ldiego73.github.io/workflows/Personal%20Site%20CI/badge.svg)](https://github.com/ldiego73/ldiego73.github.io/actions)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=ldiego73_ldiego73.github.io&metric=ncloc)](https://sonarcloud.io/dashboard?id=ldiego73_ldiego73.github.io)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=ldiego73_ldiego73.github.io&metric=alert_status)](https://sonarcloud.io/dashboard?id=ldiego73_ldiego73.github.io)
[![Coverage Status](https://coveralls.io/repos/github/ldiego73/ldiego73.github.io/badge.svg?branch=develop)](https://coveralls.io/github/ldiego73/ldiego73.github.io?branch=develop)

Personal Site using Gatsby and Github Pages

## Modern web architecture

This site was built using a modern web development architecture based on client-side JavaScript, reusable APIs, and prebuilt Markup.

![JAMStack](images/jamstack.svg)

### Structure

![Structure](images/structure.png)

### Who use?

![Who use?](images/who-use.png)

### Benefits

#### 1. Faster performance

Serve pre-built markup and assets over a CDN.

#### 2. Less expensive​

Hosting of static files are cheap or even free.​

#### 3. Better developer experience​

Front end developers can focus on the front end. This usually means quicker and more focused development.

#### 4. Scalability

If has many active users, is very simple scale your application.

## Serverless web application​

The application development rely solely on a combination of **third-party services**, **client-side logic** and cloud-hosted remote procedure calls (**Functions as a Service**)

### Structure

![Structure](images/structure-2.png)

### Benefits

#### 1. Flexible Scaling​

Automatic scaling provisioned by CDN​.

#### 2. No Server Management​

There is no available software to support, administer or to maintain.​

#### 3. No Idle Capacity​

You will not find the necessity to pre- or over-provision the ability for items like storage or computer.

#### 4. High Availability

Designed to have the built-in availability and the fault tolerance.

## Project structure

This project is structured by the next components.

```
├── src
│   ├── components
│   │   ├── __tests__
│   │   ├── about
│   │   ├── contact
│   │   ├── footer
│   │   ├── header
│   │   ├── repos
│   │   ├── resume
│   │   ├── top-button
│   │   ├── welcome
│   │   └── seo.js
│   ├── data
│   │   ├── educations.json
│   │   ├── experiences.json
│   │   ├── home.json
│   │   ├── links.json
│   │   ├── personal.skills.json
│   │   └── technical.skills.json
│   ├── hooks
│   │   └── use-hover.js
│   ├── images
│   ├── layouts
│   │   ├── __tests__
│   │   └── main.js
│   ├── pages
│   │   ├── __tests__
│   │   ├── 404.js
│   │   └── index.js
│   ├── screens
│   │   ├── home
│   │   │   ├── __tests__
│   │   │   ├── components
│   │   │   └── index.js
│   │   └── not-found
│   │   │   └── index.js
│   └── styles
│   │   ├── componentes
│   │   ├── pages
│   │   ├── _variables.scss
│   │   └── theme.scss
```
