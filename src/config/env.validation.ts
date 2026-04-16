import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  APP_NAME: Joi.string().trim().required(),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .required(),
  PORT: Joi.number().port().required(),
  API_PREFIX: Joi.string().trim().required(),
  TRUST_PROXY: Joi.boolean().required(),
  APP_TIME_ZONE: Joi.string().trim().required(),
  CORS_ORIGINS: Joi.string()
    .allow('')
    .required(),
  CORS_CREDENTIALS: Joi.boolean().required(),
  CORS_METHODS: Joi.string().trim().required(),
  CORS_ALLOWED_HEADERS: Joi.string().trim().required(),
  CORS_EXPOSED_HEADERS: Joi.string().trim().required(),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .required(),
  LOG_PRETTY_PRINT: Joi.boolean().required(),
  DATABASE_URL: Joi.string().trim().required(),
  AUTH_ACCESS_TOKEN_SECRET: Joi.string().min(16).required(),
  AUTH_ACCESS_TOKEN_TTL: Joi.string().trim().required(),
  AUTH_REFRESH_TOKEN_SECRET: Joi.string().min(16).required(),
  AUTH_REFRESH_TOKEN_TTL: Joi.string().trim().required(),
  AUTH_BCRYPT_SALT_ROUNDS: Joi.number().integer().min(8).max(15).required(),
  AUTH_PASSWORD_RECOVERY_CODE_TTL_MINUTES: Joi.number()
    .integer()
    .min(1)
    .max(60)
    .required(),
  AUTH_PASSWORD_RECOVERY_MAX_ATTEMPTS: Joi.number()
    .integer()
    .min(1)
    .max(20)
    .required(),
  AUTH_PASSWORD_RECOVERY_LOG_CODE_IN_DEV: Joi.boolean().required(),
  AUTH_SOCIAL_GOOGLE_CLIENT_IDS: Joi.string().trim().allow('').default(''),
  AUTH_SOCIAL_FACEBOOK_APP_ID: Joi.string().trim().allow('').default(''),
  AUTH_SOCIAL_FACEBOOK_APP_SECRET: Joi.string().trim().allow('').default(''),
  AUTH_SOCIAL_FACEBOOK_GRAPH_VERSION: Joi.string().trim().allow('').default(''),
  EMAIL_ENABLED: Joi.boolean().required(),
  EMAIL_SMTP_HOST: Joi.string().trim().required(),
  EMAIL_SMTP_PORT: Joi.number().port().required(),
  EMAIL_SMTP_SECURE: Joi.boolean().required(),
  EMAIL_SMTP_USER: Joi.string().trim().required(),
  EMAIL_SMTP_PASSWORD: Joi.string().trim().required(),
  EMAIL_FROM_NAME: Joi.string().trim().required(),
  EMAIL_FROM_ADDRESS: Joi.string().email().required(),
  REDIS_URL: Joi.string().trim().required(),
  STORAGE_S3_ENDPOINT: Joi.string().uri().required(),
  STORAGE_S3_ACCESS_KEY: Joi.string().trim().required(),
  STORAGE_S3_SECRET_KEY: Joi.string().trim().required(),
  STORAGE_S3_BUCKET: Joi.string().trim().required(),
  STORAGE_S3_FORCE_PATH_STYLE: Joi.boolean().required(),
  STORAGE_S3_PUBLIC_BASE_URL: Joi.string().uri().required(),
  STORAGE_MAX_UPLOAD_SIZE: Joi.number().positive().required(),
  QUEUE_PREFIX: Joi.string().trim().required(),
  FACIAL_VALIDATOR_BASE_URL: Joi.string().uri().allow('').default(''),
  RATE_LIMIT_TTL: Joi.number().positive().required(),
  RATE_LIMIT_LIMIT: Joi.number().positive().required(),
  SENSITIVE_RATE_LIMIT_TTL: Joi.number().positive().required(),
  SENSITIVE_RATE_LIMIT_LIMIT: Joi.number().positive().required(),
  AVATAR_RATE_LIMIT_TTL: Joi.number().positive().optional(),
  AVATAR_RATE_LIMIT_LIMIT: Joi.number().positive().optional(),
});
