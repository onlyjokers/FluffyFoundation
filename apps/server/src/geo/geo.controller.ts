import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GeoService, type GeoFenceConfig } from './geo.service.js';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('fence')
  getFence(): { fence: GeoFenceConfig | null } {
    return { fence: this.geoService.getGeoFence() };
  }

  @Post('fence')
  setFence(@Body() body: unknown): { fence: GeoFenceConfig | null } {
    if (body && typeof body === 'object' && (body as Record<string, unknown>).enabled === false) {
      this.geoService.clearGeoFence();
      return { fence: null };
    }

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid body');
    }

    const record = body as Record<string, unknown>;
    const center = record.center;
    const rangeM = record.rangeM;
    const address = record.address;

    const centerRecord = center && typeof center === 'object' ? (center as Record<string, unknown>) : null;
    const lat = centerRecord?.lat;
    const lng = centerRecord?.lng;

    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('Invalid body.center.lat');
    }
    if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid body.center.lng');
    }
    if (typeof rangeM !== 'number' || !Number.isFinite(rangeM) || rangeM <= 0 || rangeM > 200_000) {
      throw new BadRequestException('Invalid body.rangeM');
    }

    const normalizedAddress =
      typeof address === 'string' && address.trim().length > 0 ? address.trim() : null;

    return {
      fence: this.geoService.setGeoFence({
        center: { lat, lng },
        rangeM,
        address: normalizedAddress,
      }),
    };
  }

  /**
   * Reverse geocode coordinates to a human-readable address.
   * This is used by both Manager UI and Client devices to display precise locations.
   */
  @Get('reverse')
  async reverse(
    @Query('lat') latRaw: string,
    @Query('lng') lngRaw: string,
    @Query('lang') lang = 'zh-CN',
    @Query('zoom') zoomRaw?: string
  ) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('Invalid query param: lat');
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('Invalid query param: lng');
    }

    const zoom = zoomRaw ? Number(zoomRaw) : 18;
    if (!Number.isFinite(zoom) || zoom < 3 || zoom > 18) {
      throw new BadRequestException('Invalid query param: zoom');
    }

    return this.geoService.reverseGeocode({ lat, lng, lang, zoom });
  }
}
