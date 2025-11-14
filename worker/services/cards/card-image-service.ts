import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from '../observability/logger';

const HTTP_URL_REGEX = /^https?:\/\//i;

const inferExtension = (contentType: string | null, fallback: string = 'jpg'): string => {
  if (!contentType) {
    return fallback;
  }

  const segments = contentType.split('/');
  if (segments.length === 2) {
    const ext = segments[1].split('+')[0];
    if (ext && ext.trim().length > 0) {
      return ext.trim();
    }
  }

  return fallback;
};

const isAlreadyCached = (imageUrl: string, bucket: string): boolean =>
  imageUrl.includes(`/storage/v1/object/public/${bucket}/`);

export class CardImageService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bucket: string,
    private readonly logger: Logger
  ) {}

  async cacheRemoteImage(imageUrl: string, eventId: string, cardId: string): Promise<string | null> {
    if (!HTTP_URL_REGEX.test(imageUrl)) {
      return null;
    }

    if (isAlreadyCached(imageUrl, this.bucket)) {
      return imageUrl;
    }

    try {
      const response = await fetch(imageUrl, { redirect: 'follow' });
      if (!response.ok) {
        this.logger.log(eventId, 'cards', 'warn', '[image] failed to download card image', {
          status: response.status,
          imageUrl,
        });
        return null;
      }

      const contentType = response.headers.get('content-type');
      const extension = inferExtension(contentType);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const path = `events/${eventId}/cards/${cardId}.${extension}`;
      const uploadResult = await this.supabase.storage.from(this.bucket).upload(path, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: contentType ?? undefined,
      });

      if (uploadResult.error) {
        this.logger.log(eventId, 'cards', 'warn', '[image] failed to upload card image', {
          error: String(uploadResult.error.message ?? uploadResult.error),
        });
        return null;
      }

      const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
      if (!data || !data.publicUrl) {
        this.logger.log(eventId, 'cards', 'warn', '[image] failed to resolve public url for card image', {
          path,
        });
        return null;
      }

      return data.publicUrl;
    } catch (error) {
      this.logger.log(eventId, 'cards', 'warn', '[image] unexpected error caching remote image', {
        error: String(error),
        imageUrl,
      });
      return null;
    }
  }
}


