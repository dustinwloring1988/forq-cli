# Example Workflows

This document demonstrates how to use Forq for various real-world coding tasks, showing the full workflow from initial prompt to completion.

## Table of Contents

- [Bug Fixing](#bug-fixing)
- [Feature Implementation](#feature-implementation)
- [Code Refactoring](#code-refactoring)
- [Project Analysis](#project-analysis)
- [Learning and Documentation](#learning-and-documentation)

## Bug Fixing

### Scenario: Fix a TypeError in a React Component

**Problem**: A React component is crashing with "TypeError: Cannot read properties of undefined (reading 'map')"

**Workflow**:

1. Start Forq in your project directory:

   ```bash
   cd my-react-project
   forq repl
   ```

2. Describe the bug to Forq:

   ```
   I'm getting a TypeError in my UserList component:
   "TypeError: Cannot read properties of undefined (reading 'map')"
   The error happens when I try to display the list of users.
   ```

3. Forq will analyze the code and suggest a fix:

   ```
   Let me check the UserList component.

   The issue is likely that you're trying to map over users before the data is loaded.

   You need to add a check to ensure users exists before mapping:

   {users && users.map((user) => (
     <UserItem key={user.id} user={user} />
   ))}

   Or initialize users as an empty array:

   const [users, setUsers] = useState([]);
   ```

4. Ask Forq to implement the fix:

   ```
   Please fix the UserList component with the initialization approach.
   ```

5. Forq will read the file, make the changes, and show you the diff.

6. Verify the fix works:
   ```
   That looks good. Can you explain why initializing as an empty array is a better approach?
   ```

## Feature Implementation

### Scenario: Add Pagination to an API Endpoint

**Problem**: You need to add pagination to a MongoDB-based API endpoint that returns a list of products.

**Workflow**:

1. Start Forq:

   ```bash
   cd my-api-project
   forq repl
   ```

2. Describe the feature request:

   ```
   I need to add pagination to my GET /api/products endpoint.
   The endpoint is defined in src/routes/products.ts and uses the getAllProducts
   function from src/controllers/productController.ts.

   I want to support page and limit query parameters.
   ```

3. Forq will analyze the relevant files:

   ```
   I'll help you implement pagination for the products endpoint.

   First, let's look at the current implementation in the routes file and controller.
   ```

4. Forq will show you the existing code and explain the changes needed:

   ```
   Let's update the controller to support pagination:

   1. We'll modify the getAllProducts function to accept page and limit parameters
   2. Calculate skip value based on page and limit
   3. Update the MongoDB query to use skip() and limit()
   4. Return total count along with the paginated results
   ```

5. Ask Forq to implement the changes:

   ```
   That sounds good. Please make those changes.
   ```

6. Forq will update the files and show you the changes.

7. Ask for testing guidance:

   ```
   How can I test this pagination functionality?
   ```

8. Forq will provide testing instructions:

   ```
   You can test the pagination with curl or Postman:

   curl "http://localhost:3000/api/products?page=1&limit=10"
   curl "http://localhost:3000/api/products?page=2&limit=5"

   The response should include:
   {
     "products": [...],
     "totalCount": 42,
     "page": 1,
     "limit": 10,
     "totalPages": 5
   }
   ```

## Code Refactoring

### Scenario: Refactor Repeated Code into a Utility Function

**Problem**: You have repeated validation logic across multiple files and want to refactor it into a shared utility.

**Workflow**:

1. Start Forq:

   ```bash
   cd my-project
   forq repl
   ```

2. Describe the refactoring task:

   ```
   I have similar validation logic repeated in these files:
   - src/controllers/userController.ts
   - src/controllers/productController.ts
   - src/controllers/orderController.ts

   I want to extract this into a single utility function in src/utils/validation.ts
   ```

3. Forq will examine the code and identify the common pattern:

   ```
   I see the pattern. In each controller, you're validating request bodies
   with similar checks for required fields, types, and value ranges.

   Let's create a generic validation utility that can handle all these cases.
   ```

4. Forq will propose a solution:

   ```
   I suggest creating these functions in src/utils/validation.ts:

   1. validateRequired(data, fields) - Checks if required fields exist
   2. validateType(value, type) - Validates type of a value
   3. validateSchema(data, schema) - Validates an object against a schema

   Then we'll update each controller to use these utility functions.
   ```

5. Ask Forq to implement the refactoring:

   ```
   That looks good. Please create the validation utility and update one controller as an example.
   ```

6. Forq will create the utility file and update a controller, showing you the changes.

7. Request help with refactoring the remaining controllers:
   ```
   Great. Now please update the other controllers similarly.
   ```

## Project Analysis

### Scenario: Analyze Code Quality and Suggest Improvements

**Problem**: You want to improve the overall code quality of your project.

**Workflow**:

1. Start Forq:

   ```bash
   cd my-project
   forq repl
   ```

2. Ask for a code quality analysis:

   ```
   Can you analyze my project's code quality and suggest improvements?
   Focus on the src directory.
   ```

3. Forq will scan your project and provide an analysis:

   ```
   I've analyzed your project structure and code. Here are my observations:

   Strengths:
   - Consistent file structure and naming conventions
   - Good separation of concerns in most modules
   - Comprehensive error handling in API routes

   Areas for improvement:
   1. Inconsistent error handling in service layer
   2. Some utility functions lack proper documentation
   3. Several components have high complexity and could be split
   4. Missing unit tests for critical business logic
   5. Duplicated validation logic across controllers
   ```

4. Ask for detailed recommendations on one area:

   ```
   Can you suggest specific improvements for the error handling inconsistencies?
   ```

5. Forq will provide detailed recommendations:

   ```
   Here's how to improve error handling consistency:

   1. Create a centralized ErrorHandler class in src/utils/errorHandler.ts
   2. Define standard error types: ValidationError, NotFoundError, AuthError, etc.
   3. Add context information to errors (user ID, resource, operation)
   4. Implement consistent error logging
   5. Update service layer to use these standardized errors

   Let me show you an example implementation...
   ```

## Learning and Documentation

### Scenario: Generate Documentation for an API

**Problem**: You need to create documentation for your REST API.

**Workflow**:

1. Start Forq:

   ```bash
   cd my-api-project
   forq repl
   ```

2. Ask Forq to generate API documentation:

   ```
   I need to create documentation for my REST API.
   Can you help generate a Markdown file documenting all the endpoints?
   ```

3. Forq will analyze your routes and create documentation:

   ```
   I'll help you create comprehensive API documentation.

   First, let me analyze your route files to identify all endpoints.
   ```

4. Forq will show you the endpoints it found and begin documenting them:

   ```
   I found these API endpoints:

   - GET /api/users
   - GET /api/users/:id
   - POST /api/users
   - PUT /api/users/:id
   - DELETE /api/users/:id
   - ...other endpoints...

   I'll create a detailed API.md file documenting each one with:
   - HTTP method and path
   - Request parameters and body format
   - Response format and status codes
   - Example requests and responses
   ```

5. Ask Forq to generate the documentation:

   ```
   That looks great. Please generate the API.md file.
   ```

6. Forq will create the documentation file and show you the content.

7. Ask for additional documentation features:

   ```
   Can you add a section on authentication and error handling?
   ```

8. Forq will update the documentation with the requested sections.
