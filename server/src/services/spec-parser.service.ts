import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';
import type {
  HttpMethod,
  NormalizedOperation,
  ParameterDefinition,
  ParsedSpecSummary,
  RequestBodyDefinition,
  ResponseDefinition,
} from '@api-sentinel/shared';

const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

export class SpecParserError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code = 'SPEC_PARSE_ERROR', details?: unknown) {
    super(message);
    this.name = 'SpecParserError';
    this.code = code;
    this.details = details;
  }
}

export class SpecParserService {
  /**
   * Parses, validates, and normalizes an OpenAPI JSON/YAML string.
   */
  public async parse(rawContent: string): Promise<ParsedSpecSummary> {
    if (!rawContent || !rawContent.trim()) {
      throw new SpecParserError('Specification content is empty.', 'EMPTY_SPEC_CONTENT');
    }

    // 1. Syntax Parsing (handles both JSON and YAML)
    let parsedObject: unknown;
    try {
      parsedObject = YAML.parse(rawContent);
    } catch (syntaxError) {
      const err = syntaxError as Error;
      throw new SpecParserError(
        `Failed to parse specification syntax (invalid JSON/YAML): ${err.message}`,
        'INVALID_SYNTAX',
        err
      );
    }

    if (!parsedObject || typeof parsedObject !== 'object') {
      throw new SpecParserError(
        'Parsed specification must be a valid JSON or YAML object.',
        'INVALID_SPEC_STRUCTURE'
      );
    }

    // 2. Validate and Dereference schema via SwaggerParser
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dereferencedSpec: any;
    try {
      // Validate schema compliance
      await SwaggerParser.validate(JSON.parse(JSON.stringify(parsedObject)));
      // Dereference all $ref pointers
      dereferencedSpec = await SwaggerParser.dereference(JSON.parse(JSON.stringify(parsedObject)));
    } catch (validationError) {
      const err = validationError as Error;
      throw new SpecParserError(
        `OpenAPI validation error: ${err.message}`,
        'SPEC_VALIDATION_ERROR',
        err
      );
    }

    // 3. Normalize Spec Metadata
    const openapiVersion = dereferencedSpec.openapi || dereferencedSpec.swagger || 'Unknown';
    const info = dereferencedSpec.info || {};
    const title = info.title || 'Untitled API';
    const version = info.version || '1.0.0';
    const description = info.description;

    // Servers extraction
    const servers: string[] = [];
    if (Array.isArray(dereferencedSpec.servers)) {
      for (const server of dereferencedSpec.servers) {
        if (server?.url) {
          servers.push(server.url);
        }
      }
    } else if (dereferencedSpec.host) {
      const scheme = (dereferencedSpec.schemes && dereferencedSpec.schemes[0]) || 'http';
      const basePath = dereferencedSpec.basePath || '';
      servers.push(`${scheme}://${dereferencedSpec.host}${basePath}`);
    }

    // 4. Normalize Operations
    const operations: NormalizedOperation[] = [];
    const paths = dereferencedSpec.paths || {};

    for (const [pathStr, pathItem] of Object.entries<any>(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;

      // Path-level parameters
      const pathLevelParams: ParameterDefinition[] = this.extractParameters(pathItem.parameters);

      for (const method of HTTP_METHODS) {
        const operationObj = pathItem[method];
        if (!operationObj || typeof operationObj !== 'object') continue;

        // Operation-level parameters (override path-level params with same name + in)
        const opLevelParams = this.extractParameters(operationObj.parameters);
        const mergedParams = this.mergeParameters(pathLevelParams, opLevelParams);

        // Request Body extraction
        const requestBody = this.extractRequestBody(operationObj.requestBody, operationObj.parameters);

        // Responses extraction
        const responses = this.extractResponses(operationObj.responses);

        // Operation ID fallback
        const cleanPath = pathStr.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const operationId = operationObj.operationId || `${method}_${cleanPath || 'root'}`;

        operations.push({
          operationId,
          method,
          path: pathStr,
          summary: operationObj.summary,
          description: operationObj.description,
          tags: Array.isArray(operationObj.tags) ? operationObj.tags : [],
          parameters: mergedParams,
          requestBody,
          responses,
          servers: Array.isArray(operationObj.servers) && operationObj.servers.length > 0
            ? operationObj.servers.map((s: any) => s.url).filter(Boolean)
            : servers,
        });
      }
    }

    return {
      title,
      version,
      description,
      openapiVersion,
      servers,
      operationCount: operations.length,
      operations,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractParameters(paramsArray: any): ParameterDefinition[] {
    if (!Array.isArray(paramsArray)) return [];

    return paramsArray
      .filter((p) => p && typeof p === 'object' && p.name && p.in)
      .map((p) => ({
        name: String(p.name),
        in: p.in as ParameterDefinition['in'],
        required: Boolean(p.required || p.in === 'path'),
        schema: p.schema || (p.type ? { type: p.type, format: p.format } : undefined),
        description: p.description,
        example: p.example ?? (p.schema ? p.schema.example : undefined),
      }));
  }

  private mergeParameters(
    pathParams: ParameterDefinition[],
    opParams: ParameterDefinition[]
  ): ParameterDefinition[] {
    const map = new Map<string, ParameterDefinition>();

    for (const p of pathParams) {
      map.set(`${p.in}:${p.name}`, p);
    }
    for (const p of opParams) {
      map.set(`${p.in}:${p.name}`, p);
    }

    return Array.from(map.values());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractRequestBody(requestBodyObj: any, legacyParams: any): RequestBodyDefinition | undefined {
    // OpenAPI 3.x requestBody
    if (requestBodyObj && typeof requestBodyObj === 'object') {
      const content = requestBodyObj.content || {};
      const contentTypes = Object.keys(content);
      const primaryContentType = contentTypes.find((c) => c.includes('json')) || contentTypes[0] || 'application/json';
      const contentSchema = content[primaryContentType]?.schema;
      const example = content[primaryContentType]?.example ?? requestBodyObj.example;

      return {
        required: Boolean(requestBodyObj.required),
        contentType: primaryContentType,
        schema: contentSchema,
        description: requestBodyObj.description,
        example,
      };
    }

    // Swagger 2.0 body parameter fallback
    if (Array.isArray(legacyParams)) {
      const bodyParam = legacyParams.find((p) => p && p.in === 'body');
      if (bodyParam) {
        return {
          required: Boolean(bodyParam.required),
          contentType: 'application/json',
          schema: bodyParam.schema,
          description: bodyParam.description,
          example: bodyParam.example ?? (bodyParam.schema ? bodyParam.schema.example : undefined),
        };
      }
    }

    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractResponses(responsesObj: any): ResponseDefinition[] {
    if (!responsesObj || typeof responsesObj !== 'object') {
      return [];
    }

    const responses: ResponseDefinition[] = [];

    for (const [statusCode, resObj] of Object.entries<any>(responsesObj)) {
      if (!resObj || typeof resObj !== 'object') continue;

      let primaryContentType: string | undefined;
      let schema: Record<string, unknown> | undefined;

      // OpenAPI 3.x response content
      if (resObj.content && typeof resObj.content === 'object') {
        const contentTypes = Object.keys(resObj.content);
        primaryContentType = contentTypes.find((c) => c.includes('json')) || contentTypes[0];
        if (primaryContentType) {
          schema = resObj.content[primaryContentType]?.schema;
        }
      } else if (resObj.schema) {
        // Swagger 2.0 response schema
        primaryContentType = 'application/json';
        schema = resObj.schema;
      }

      responses.push({
        statusCode: String(statusCode),
        description: resObj.description,
        contentType: primaryContentType,
        schema,
        headers: resObj.headers,
      });
    }

    return responses;
  }
}
