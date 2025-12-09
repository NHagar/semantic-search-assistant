# API Test Suite

Automated tests for the Semantic Search Assistant API endpoints.

## Overview

This test suite uses [Vitest](https://vitest.dev/) for testing and [Supertest](https://github.com/ladjs/supertest) for HTTP assertions. It provides comprehensive coverage of all API endpoints.

## Running Tests

```bash
# Run tests in watch mode (interactive)
npm test

# Run tests once
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Test Structure

```
src/__tests__/
├── setup.ts           # Test configuration and database cleanup
├── helpers.ts         # Helper functions for creating test data
├── health.test.ts     # Health check endpoint tests
├── models.test.ts     # Models endpoint tests
├── projects.test.ts   # Projects CRUD tests
├── documents.test.ts  # Document management tests
├── search.test.ts     # Search functionality tests
├── corpus.test.ts     # Corpus synopsis tests
├── plans.test.ts      # Search plan tests
├── reports.test.ts    # Report generation tests
└── final.test.ts      # Final report synthesis tests
```

## Test Coverage

The test suite covers:

### Health & Config
- ✓ Health check endpoint
- ✓ Available models listing

### Projects
- ✓ Create project
- ✓ List projects
- ✓ Get project by ID
- ✓ Update project
- ✓ Delete project

### Documents
- ✓ Upload PDF files
- ✓ List documents
- ✓ Get document by ID
- ✓ Update document content
- ✓ Delete document
- ✓ Extract text from PDFs
- ✓ Embed documents
- ✓ Re-embed individual documents

### Search
- ✓ Semantic search
- ✓ Get citation source

### Corpus
- ✓ Sample tokens from corpus
- ✓ Generate corpus synopsis
- ✓ Get corpus synopsis
- ✓ Update corpus synopsis

### Search Plans
- ✓ Generate search plans
- ✓ List plans
- ✓ Get plan by ID
- ✓ Update plan
- ✓ Delete plan
- ✓ Execute plan

### Reports
- ✓ Execute selected plans
- ✓ List reports
- ✓ Get report by ID
- ✓ Update report
- ✓ Delete report
- ✓ Regenerate report

### Final Report
- ✓ Get final report
- ✓ Update final report
- ✓ Synthesize final report
- ✓ Evaluate reports

## Test Database

Tests use an isolated test database (`test.db`) that is:
- Created fresh for each test run
- Automatically cleaned up after each test
- Never interferes with development or production data

## Helper Functions

### `testRequest`
Wrapper around Supertest for making HTTP requests to the API.

### `createTestProject(name)`
Creates a test project and returns the project object.

### `createTestDocument(projectId, title, content)`
Creates a test document for a given project.

## Writing New Tests

When adding new endpoints or features:

1. Create a new test file or add to existing ones
2. Use the `describe` block for the endpoint group
3. Use `it` blocks for individual test cases
4. Use `beforeEach` to set up test data
5. Use the helper functions for common operations
6. Always test both success and error cases

Example:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { testRequest, createTestProject } from './helpers';

describe('New Endpoint', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await createTestProject('Test Project');
    projectId = project.id;
  });

  it('should do something successfully', async () => {
    const response = await testRequest
      .post(`/api/projects/${projectId}/new-endpoint`)
      .send({ data: 'test' })
      .expect(200);

    expect(response.body).toHaveProperty('result');
  });

  it('should handle errors', async () => {
    await testRequest
      .post(`/api/projects/${projectId}/new-endpoint`)
      .send({})
      .expect(400);
  });
});
```

## Best Practices

- ✓ Test both success and failure paths
- ✓ Test validation errors
- ✓ Test 404 responses for non-existent resources
- ✓ Clean up after tests (handled automatically)
- ✓ Use descriptive test names
- ✓ Keep tests isolated and independent
- ✓ Mock external dependencies when needed

## CI/CD Integration

To integrate with CI/CD pipelines, run:

```bash
npm run test:run
```

This runs tests once and exits with the appropriate status code.
