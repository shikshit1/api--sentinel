export const SAMPLE_TASK_API_YAML = `openapi: 3.0.3
info:
  title: Task Management API
  version: 1.0.0
  description: A production-ready API specification demonstrating CRUD operations, authentication, and validation.
servers:
  - url: https://api.sentinel-tasks.local/v1
    description: Local target server
paths:
  /tasks:
    get:
      operationId: listTasks
      summary: Retrieve all tasks
      description: Returns a paginated list of tasks filtered by status.
      tags:
        - tasks
      parameters:
        - name: status
          in: query
          required: false
          description: Filter tasks by completion status
          schema:
            type: string
            enum: [pending, in_progress, completed]
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: Successfully fetched tasks list
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Task'
        '400':
          description: Invalid query parameters
    post:
      operationId: createTask
      summary: Create a new task
      description: Adds a new task with title, priority, and optional due date.
      tags:
        - tasks
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTaskPayload'
      responses:
        '201':
          description: Task created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
        '400':
          description: Missing required fields or schema violation
        '422':
          description: Unprocessable entity

  /tasks/{id}:
    parameters:
      - name: id
        in: path
        required: true
        description: Unique task UUID
        schema:
          type: string
          format: uuid
    get:
      operationId: getTaskById
      summary: Fetch single task details
      tags:
        - tasks
      responses:
        '200':
          description: Task details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Task'
        '404':
          description: Task not found
    delete:
      operationId: deleteTask
      summary: Delete a task
      tags:
        - tasks
      responses:
        '204':
          description: Task deleted
        '404':
          description: Task not found

components:
  schemas:
    Task:
      type: object
      required:
        - id
        - title
        - status
      properties:
        id:
          type: string
          format: uuid
        title:
          type: string
          example: Run regression suite
        description:
          type: string
        status:
          type: string
          enum: [pending, in_progress, completed]
        priority:
          type: string
          enum: [low, medium, high]
          default: medium
    CreateTaskPayload:
      type: object
      required:
        - title
      properties:
        title:
          type: string
          minLength: 3
          maxLength: 100
        description:
          type: string
        priority:
          type: string
          enum: [low, medium, high]
`;

export const SAMPLE_PETSTORE_JSON = JSON.stringify(
  {
    openapi: '3.0.3',
    info: {
      title: 'Swagger Petstore — Minimal',
      version: '1.0.0',
      description: 'Standard petstore sample spec for testing endpoint extraction'
    },
    servers: [{ url: 'https://petstore.swagger.io/v2' }],
    paths: {
      '/pets': {
        get: {
          operationId: 'findPets',
          summary: 'Find pets by status',
          tags: ['pets'],
          parameters: [
            {
              name: 'status',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: ['available', 'pending', 'sold']
              }
            }
          ],
          responses: {
            '200': {
              description: 'Successful operation',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['id', 'name'],
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        tag: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        post: {
          operationId: 'addPet',
          summary: 'Add a new pet to the store',
          tags: ['pets'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    id: { type: 'integer' },
                    name: { type: 'string' },
                    tag: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Pet created'
            },
            '400': {
              description: 'Invalid input'
            }
          }
        }
      }
    }
  },
  null,
  2
);
