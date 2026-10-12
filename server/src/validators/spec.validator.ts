import { z } from 'zod';

export const parseSpecSchema = z.object({
  specContent: z
    .string({
      required_error: 'Field "specContent" is required.',
      invalid_type_error: 'Field "specContent" must be a string.',
    })
    .min(1, 'Field "specContent" cannot be empty.'),
  sourceFormat: z.enum(['json', 'yaml', 'auto']).optional().default('auto'),
});

export type ParseSpecInput = z.infer<typeof parseSpecSchema>;
