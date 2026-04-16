export interface JwtAccessTokenPayload {
  sub: string;
  sid: string;
  email: string;
  typ: 'access';
}

export interface JwtRefreshTokenPayload {
  sub: string;
  sid: string;
  typ: 'refresh';
}
