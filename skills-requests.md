# The Office

`the-office` is a set of skills for AI-aid-software-development workflow.

## Overview

Develop skills and a workflow based on [compozy-os](https://github.com/compozy/compozy#readme) but in a simpler way. This will be a repository with versioning.

## Goals

1. Develop a workflow to improve the harness when developing in a new repository, or in a legacy one.
2. Develop a workflow that allows the user to develop software with AI assistance.

## 2. The Employees

`the-office` is a joke using the `The Office` web series.

### 2.1 The Judge

The judge is the very first level of the workflow. It will judge the user request based on:

- Does this request needs to be break down into smaller chunks of work?

If the answer is yes, then it needs to call the `The Product Owner`.

If the answer is no, then it needs to call the `The SWE` directly.

### 2.2 The Product Owner

`The Product Owner` goals is to clarify the request, in such a way that it must guarantee that it understood
the user's request.

Once clarified, it must call `The Planner`.

### 2.3 The Planner

`The Planner` is the one in charge of break down the work scope into smaller chunks (a.k.a. tasks) into Markdown files. In such a way that we can use it as a `Kanban Board`.

#### 2.3.1 The Planner's Task Schema

```[markdown]
---
task_no: 1
depends_on: none | task_no 2, and etc... (which task does this one needs to be finished first before moving on).
status: pending | in-progress | completed
description: task description.
dod: task's definition of done.
model: claude-sonnet-4.5 (example)
branch: git branch name (once finished)
commit: git branch commit (once finished)
---
```

#### 2.3.2 The Planner's Task's Folder Structure

```[shell]
|- the-office-features/
|--- feature-a/
|------ task-01.md
|------ task-02.md
|------ overview.md
|------ ...
|--- feature-b/
|------ task-01.md
|------ task-02.md
|------ overview.md
|------ ...
```

### 2.4 The Devil's Advocate

`The Devil's Advocate` must be called once `The Planner` finishes its work. `The Devil's Advocate` must analyze and review `The Planner` work and verify:

- Does this plan is feasible?
- Does it accomplish the user's request?

If the answer is `yes`, than we're finished.
If the answer is `no`, than we must call `The Planner` again and refine the work according to `The Devil's Advocate` review.

### 2.5 The SWE

`The SWE` (Softare Engineer) is the task executor indeed. It must use the model specified in the task.

#### 2.5.1 The SWE Obligations

`The SWE` will not only implement the task as it is. It must do something else.

- It must develop `sensors` as feedback controls. `sensors` are tools like: linters, test coverage rules, pre-commit hooks, test tools (pytest, vitest and etc...). Any kind of deterministic rule that runs on CPU and do not rely on AI judgement.
- It must self-correct according to `The Reviewer` review.

### 2.6 The Reviewer

`The Reviewer` plays the role of review the work done by `The SWE` and point-out issues, bugs, lack of test coverage.

And, mainly, `The Reviewer` must guarantee that the `definition of done` of the task was achieved.
