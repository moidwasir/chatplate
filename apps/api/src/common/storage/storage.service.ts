import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { put as putBlob } from '@vercel/blob';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

export const LOCAL_UPLOAD_DIR = join(process.cwd(), 'uploads');

/**
 * Stores uploaded files, in order of preference:
 * 1. Vercel Blob when BLOB_READ_WRITE_TOKEN is set (public https URLs; WhatsApp can fetch them)
 * 2. An S3-compatible bucket when S3_* env vars are set
 * 3. Local disk under ./uploads (served at /uploads), for development only
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = config.get<string>('S3_SECRET_KEY');
    const configured =
      endpoint && accessKeyId && secretAccessKey && !accessKeyId.startsWith('your_');

    if (configured) {
      this.s3 = new S3Client({
        endpoint,
        region: config.get<string>('S3_REGION') ?? 'auto',
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    } else if (!config.get<string>('BLOB_READ_WRITE_TOKEN')) {
      this.logger.warn(`No cloud storage configured — storing uploads locally in ${LOCAL_UPLOAD_DIR}`);
    }
  }

  /** Save a file and return its public URL */
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    if (this.config.get<string>('BLOB_READ_WRITE_TOKEN')) {
      const blob = await putBlob(key, body, { access: 'public', contentType, addRandomSuffix: true });
      return blob.url;
    }

    if (this.s3) {
      const bucket = this.config.getOrThrow<string>('S3_BUCKET');
      await this.s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
      const publicBase =
        this.config.get<string>('S3_PUBLIC_URL') ??
        `${this.config.get<string>('S3_ENDPOINT')}/${bucket}`;
      return `${publicBase.replace(/\/$/, '')}/${key}`;
    }

    // Serverless file systems are read-only and wiped between requests
    if (process.env.VERCEL) {
      throw new ServiceUnavailableException('Photo storage is not set up. Connect Vercel Blob to the API project.');
    }

    const path = join(LOCAL_UPLOAD_DIR, key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, body);
    const apiBase =
      this.config.get<string>('API_PUBLIC_URL') ?? `http://localhost:${process.env.PORT ?? 3001}`;
    return `${apiBase.replace(/\/$/, '')}/uploads/${key}`;
  }
}
