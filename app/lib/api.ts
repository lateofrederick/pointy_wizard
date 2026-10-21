'use client';

import type { PointyDocument } from '../types/pointy';
import type { PipelineSummary } from '../api/pipelines/route';
import type { GrantView } from '../api/grants/route';
import type { GrantScope } from './constants';

/** Typed client for the route handlers. Every call goes through `request`. */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new ApiError(
      typeof body.error === 'string' ? body.error : 'Something went wrong.',
      response.status,
    );
  }

  return body as T;
}

export const api = {
  session: () => request<{ user: SessionUser | null }>('/api/auth/session'),

  signIn: (email: string, password: string) =>
    request<{ user: SessionUser }>('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  signUp: (email: string, password: string, name?: string) =>
    request<{ user: SessionUser }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  signOut: () => request<{ ok: true }>('/api/auth/session', { method: 'DELETE' }),

  listPipelines: () => request<{ pipelines: PipelineSummary[] }>('/api/pipelines'),

  createPipeline: (name: string, source?: string) =>
    request<{ pipeline: PipelineSummary }>('/api/pipelines', {
      method: 'POST',
      body: JSON.stringify({ name, source }),
    }),

  getPipeline: (id: string) =>
    request<{ pipeline: { id: string; updatedAt: string; document: PointyDocument } }>(
      `/api/pipelines/${id}`,
    ),

  savePipeline: (
    id: string,
    payload: {
      name: string;
      source: string;
      layout: PointyDocument['layout'];
      definitions: PointyDocument['definitions'];
      sources: PointyDocument['sources'];
    },
  ) =>
    request<{ ok: true; updatedAt: string }>(`/api/pipelines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deletePipeline: (id: string) =>
    request<{ ok: true }>(`/api/pipelines/${id}`, { method: 'DELETE' }),

  listGrants: () => request<{ grants: GrantView[] }>('/api/grants'),

  authorise: (packageName: string, scopes: GrantScope[]) =>
    request<{ grant: GrantView }>('/api/grants', {
      method: 'POST',
      body: JSON.stringify({ package: packageName, scopes }),
    }),

  revokeGrant: (packageName: string) =>
    request<{ ok: true }>(`/api/grants?package=${encodeURIComponent(packageName)}`, {
      method: 'DELETE',
    }),
};

export type { PipelineSummary, GrantView, GrantScope };
