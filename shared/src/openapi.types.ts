export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head';

export interface ParameterDefinition {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required: boolean;
  schema?: Record<string, unknown>;
  description?: string;
  example?: unknown;
}

export interface RequestBodyDefinition {
  required: boolean;
  contentType: string;
  schema?: Record<string, unknown>;
  description?: string;
  example?: unknown;
}

export interface ResponseDefinition {
  statusCode: string;
  description?: string;
  contentType?: string;
  schema?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}

export interface NormalizedOperation {
  operationId: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParameterDefinition[];
  requestBody?: RequestBodyDefinition;
  responses: ResponseDefinition[];
  servers: string[];
}

export interface ParsedSpecSummary {
  title: string;
  version: string;
  description?: string;
  openapiVersion: string;
  servers: string[];
  operationCount: number;
  operations: NormalizedOperation[];
}

export interface ParseSpecRequest {
  specContent: string;
  sourceFormat?: 'json' | 'yaml' | 'auto';
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  path?: string[];
  details?: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorDetail;
}
