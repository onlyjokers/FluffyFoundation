/**
 * Purpose: HTTP API for Manager login, logout, and session restoration.
 */
import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ManagerAuthService } from './manager-auth.service.js';

function readBodyString(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

@Controller('api/manager/auth')
export class ManagerAuthController {
  constructor(private readonly auth: ManagerAuthService) {}

  @Post('login')
  login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): { user: string } {
    const result = this.auth.login({
      username: readBodyString(body, 'username'),
      password: readBodyString(body, 'password'),
    });
    if (!result.ok) throw new UnauthorizedException('invalid manager credentials');
    res.setHeader('Set-Cookie', result.cookie);
    return { user: result.user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.setHeader('Set-Cookie', this.auth.createClearCookie());
    return { ok: true };
  }

  @Get('session')
  session(@Req() req: Request, @Res({ passthrough: true }) res: Response): { user: string } {
    const result = this.auth.verifyCookieHeader(req.header('cookie'));
    if (!result.ok) throw new UnauthorizedException('invalid manager session');
    if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
    return { user: result.user };
  }
}
