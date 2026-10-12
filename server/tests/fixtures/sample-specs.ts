export const VALID_OPENAPI_YAML = `
openapi: 3.0.3
info:
  title: Task Management API
  version: 1.0.0
  description: Sample API for testing task tracking endpoints
servers:
  - url: https://api.example.com/v1
paths:
  /tasks:
    get:
      operationId: listTasks
      summary: List all tasks
      tags:
        - tasks
      parameters:
        - name: status
          in: query
          required: false
          schema:
            type: string
            enum: [pending, completed]
      responses:
        '200':
          description: Successful task list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Task'
    post:
      operationId: createTask
      summary: Create a new task
      tags:
        - tasks
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTaskRequest'
      responses:
        '201':
          description: Task created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
        '400':
          description: Invalid input

  /tasks/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
    get:
      summary: Get task by ID
      responses:
        '200':
          description: Task details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
        '404':
          description: Task not found

components:
  schemas:
    Task:
      type: object
      required:
        - id
        - title
      properties:
        id:
          type: string
        title:
          type: string
        completed:
          type: boolean
    CreateTaskRequest:
      type: object
      required:
        - title
      properties:
        title:
          type: string
        completed:
          type: boolean
`;

export const VALID_OPENAPI_JSON = JSON.stringify({
  openapi: '3.0.3',
  info: {
    title: 'Pet Store Simple',
    version: '2.1.0',
    description: 'A minimal petstore API'
  },
  servers: [{ url: 'https://petstore.example.com/api' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'findPets',
        summary: 'Find pets',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer' }
          }
        ],
        responses: {
          '200': {
            description: 'List of pets',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      name: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}, null, 2);

export const INVALID_SYNTAX_SPEC = `
openapi: 3.0.3
info:
  title: Broken API
  - invalid list inside mapping
paths: [
`;

export const INVALID_SCHEMA_SPEC = JSON.stringify({
  swagger_fake: 'not-real',
  foo: 'bar'
});
