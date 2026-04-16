const parseBoolean = (value: string): boolean =>
  ['true', '1', 'yes', 'on'].includes(value.toLowerCase());

const parseNumber = (value: string): number => Number(value);

const parseOptionalNumber = (value?: string): number | undefined =>
  value?.trim() ? Number(value) : undefined;

const parseOptionalString = (value?: string): string =>
  value?.trim() ?? '';

const parseOrigins = (value: string | undefined): string[] | boolean => {
  if (!value) {
    return false;
  }

  if (value === '*') {
    return true;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const parseCsv = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default () => {
  const ttl = parseNumber(process.env.RATE_LIMIT_TTL as string);
  const limit = parseNumber(process.env.RATE_LIMIT_LIMIT as string);
  const sensitiveTtl = parseNumber(
    process.env.SENSITIVE_RATE_LIMIT_TTL as string,
  );
  const sensitiveLimit = parseNumber(
    process.env.SENSITIVE_RATE_LIMIT_LIMIT as string,
  );
  const avatarTtl =
    parseOptionalNumber(process.env.AVATAR_RATE_LIMIT_TTL) ?? sensitiveTtl;
  const avatarLimit =
    parseOptionalNumber(process.env.AVATAR_RATE_LIMIT_LIMIT) ??
    Math.max(sensitiveLimit, 30);

  return {
    app: {
      name: process.env.APP_NAME as string,
      env: process.env.NODE_ENV as string,
      port: parseNumber(process.env.PORT as string),
      apiPrefix: process.env.API_PREFIX as string,
      trustProxy: parseBoolean(process.env.TRUST_PROXY as string),
      timeZone: process.env.APP_TIME_ZONE as string,
    },
    cors: {
      origin: parseOrigins(process.env.CORS_ORIGINS),
      credentials: parseBoolean(process.env.CORS_CREDENTIALS as string),
      methods: parseCsv(process.env.CORS_METHODS as string),
      allowedHeaders: parseCsv(process.env.CORS_ALLOWED_HEADERS as string),
      exposedHeaders: parseCsv(process.env.CORS_EXPOSED_HEADERS as string),
    },
    logger: {
      level: process.env.LOG_LEVEL as string,
      prettyPrint: parseBoolean(process.env.LOG_PRETTY_PRINT as string),
    },
    database: {
      url: process.env.DATABASE_URL,
    },
    auth: {
      accessTokenSecret: process.env.AUTH_ACCESS_TOKEN_SECRET as string,
      accessTokenTtl: process.env.AUTH_ACCESS_TOKEN_TTL as string,
      refreshTokenSecret: process.env.AUTH_REFRESH_TOKEN_SECRET as string,
      refreshTokenTtl: process.env.AUTH_REFRESH_TOKEN_TTL as string,
      bcryptSaltRounds: parseNumber(
        process.env.AUTH_BCRYPT_SALT_ROUNDS as string,
      ),
      passwordRecoveryCodeTtlMinutes: parseNumber(
        process.env.AUTH_PASSWORD_RECOVERY_CODE_TTL_MINUTES as string,
      ),
      passwordRecoveryMaxAttempts: parseNumber(
        process.env.AUTH_PASSWORD_RECOVERY_MAX_ATTEMPTS as string,
      ),
      passwordRecoveryLogCodeInDev: parseBoolean(
        process.env.AUTH_PASSWORD_RECOVERY_LOG_CODE_IN_DEV as string,
      ),
      social: {
        googleClientIds: parseCsv(process.env.AUTH_SOCIAL_GOOGLE_CLIENT_IDS),
        facebookAppId: parseOptionalString(
          process.env.AUTH_SOCIAL_FACEBOOK_APP_ID,
        ),
        facebookAppSecret: parseOptionalString(
          process.env.AUTH_SOCIAL_FACEBOOK_APP_SECRET,
        ),
        facebookGraphVersion: parseOptionalString(
          process.env.AUTH_SOCIAL_FACEBOOK_GRAPH_VERSION,
        ),
      },
    },
    email: {
      enabled: parseBoolean(process.env.EMAIL_ENABLED as string),
      host: process.env.EMAIL_SMTP_HOST as string,
      port: parseNumber(process.env.EMAIL_SMTP_PORT as string),
      secure: parseBoolean(process.env.EMAIL_SMTP_SECURE as string),
      user: process.env.EMAIL_SMTP_USER as string,
      password: process.env.EMAIL_SMTP_PASSWORD as string,
      fromName: process.env.EMAIL_FROM_NAME as string,
      fromAddress: process.env.EMAIL_FROM_ADDRESS as string,
    },
    redis: {
      url: process.env.REDIS_URL as string,
    },
    storage: {
      endpoint: process.env.STORAGE_S3_ENDPOINT as string,
      accessKey: process.env.STORAGE_S3_ACCESS_KEY as string,
      secretKey: process.env.STORAGE_S3_SECRET_KEY as string,
      bucket: process.env.STORAGE_S3_BUCKET as string,
      forcePathStyle: parseBoolean(
        process.env.STORAGE_S3_FORCE_PATH_STYLE as string,
      ),
      publicBaseUrl: process.env.STORAGE_S3_PUBLIC_BASE_URL as string,
      maxUploadSize: parseNumber(process.env.STORAGE_MAX_UPLOAD_SIZE as string),
    },
    queue: {
      prefix: process.env.QUEUE_PREFIX as string,
    },
    facialValidator: {
      baseUrl:
        parseOptionalString(process.env.FACIAL_VALIDATOR_BASE_URL) ||
        'http://localhost:8000',
    },
    rateLimit: {
      ttl,
      limit,
      sensitiveTtl,
      sensitiveLimit,
      avatarTtl,
      avatarLimit,
    },
  };
};
