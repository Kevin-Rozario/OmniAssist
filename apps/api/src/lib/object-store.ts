import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface ObjectStore {
  put: (key: string, body: Uint8Array, contentType: string) => Promise<void>;
  get: (key: string) => Promise<Uint8Array>;
  delete: (key: string) => Promise<void>;
}

/** Narrow S3 surface so unit tests can inject a fake without the AWS SDK. */
export interface ObjectStoreClient {
  putObject: (input: {
    bucket: string;
    key: string;
    body: Uint8Array;
    contentType: string;
  }) => Promise<void>;
  getObject: (input: {
    bucket: string;
    key: string;
  }) => Promise<Uint8Array>;
  deleteObject: (input: {
    bucket: string;
    key: string;
  }) => Promise<void>;
}

export interface ObjectStoreOptions {
  bucket: string;
  client: ObjectStoreClient;
}

export function createObjectStore(options: ObjectStoreOptions): ObjectStore {
  const { bucket, client } = options;
  return {
    put: (key, body, contentType) => client.putObject({ bucket, key, body, contentType }),
    get: key => client.getObject({ bucket, key }),
    delete: key => client.deleteObject({ bucket, key }),
  };
}

export interface R2ClientConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Defaults to `https://{accountId}.r2.cloudflarestorage.com`. */
  endpoint?: string;
}

export function r2Endpoint(accountId: string, endpoint?: string): string {
  if (endpoint)
    return endpoint.replace(/\/$/, '');
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function createR2ObjectStoreClient(config: R2ClientConfig): ObjectStoreClient {
  const client = new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(config.accountId, config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return {
    async putObject({ bucket, key, body, contentType }) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
    },
    async getObject({ bucket, key }) {
      const response = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes)
        throw new Error(`Object store returned an empty body for key ${key}`);
      return bytes;
    },
    async deleteObject({ bucket, key }) {
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
    },
  };
}
