import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@actions/core', () => ({
  info: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@actions/github', () => ({
  context: {
    payload: {},
    repo: { owner: 'test-owner', repo: 'test-repo' },
  },
  getOctokit: vi.fn(),
}));

import * as core from '@actions/core';
import * as github from '@actions/github';
import { upsertPrComment } from '../../src/utils/comment';

describe('upsertPrComment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('warns and returns when GITHUB_TOKEN is not set', async () => {
    delete process.env.GITHUB_TOKEN;

    await upsertPrComment('test body');

    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('GITHUB_TOKEN not available'),
    );
  });

  it('skips when not in a pull request context', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    (github.context as any).payload = {};

    await upsertPrComment('test body');

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Not a pull request context'),
    );
  });

  it('creates a new comment when no existing comment found', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    (github.context as any).payload = { pull_request: { number: 42 } };
    (github.context as any).repo = { owner: 'test-owner', repo: 'test-repo' };

    const mockCreateComment = vi.fn().mockResolvedValue({});
    const mockListComments = vi.fn().mockResolvedValue({ data: [] });
    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments: mockListComments,
          createComment: mockCreateComment,
          updateComment: vi.fn(),
        },
      },
    } as any);

    await upsertPrComment('new comment body');

    expect(mockListComments).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      issue_number: 42,
      per_page: 100,
    });
    expect(mockCreateComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      issue_number: 42,
      body: expect.stringContaining('new comment body'),
    });
    expect(core.info).toHaveBeenCalledWith('PR comment posted successfully.');
  });

  it('updates an existing comment when marker is found', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    (github.context as any).payload = { pull_request: { number: 42 } };
    (github.context as any).repo = { owner: 'test-owner', repo: 'test-repo' };

    const mockUpdateComment = vi.fn().mockResolvedValue({});
    const mockListComments = vi.fn().mockResolvedValue({
      data: [
        { id: 100, body: 'unrelated comment' },
        { id: 200, body: '<!-- lynxprompt-action -->\nold content' },
      ],
    });
    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments: mockListComments,
          createComment: vi.fn(),
          updateComment: mockUpdateComment,
        },
      },
    } as any);

    await upsertPrComment('updated body');

    expect(mockUpdateComment).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      comment_id: 200,
      body: expect.stringContaining('updated body'),
    });
    expect(core.info).toHaveBeenCalledWith('PR comment posted successfully.');
  });

  it('includes the marker in the comment body', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    (github.context as any).payload = { pull_request: { number: 1 } };
    (github.context as any).repo = { owner: 'o', repo: 'r' };

    const mockCreateComment = vi.fn().mockResolvedValue({});
    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({ data: [] }),
          createComment: mockCreateComment,
          updateComment: vi.fn(),
        },
      },
    } as any);

    await upsertPrComment('body text');

    const calledBody = mockCreateComment.mock.calls[0][0].body;
    expect(calledBody).toContain('<!-- lynxprompt-action -->');
    expect(calledBody).toContain('body text');
  });

  it('skips comments with null body when searching for existing', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    (github.context as any).payload = { pull_request: { number: 5 } };
    (github.context as any).repo = { owner: 'o', repo: 'r' };

    const mockCreateComment = vi.fn().mockResolvedValue({});
    vi.mocked(github.getOctokit).mockReturnValue({
      rest: {
        issues: {
          listComments: vi.fn().mockResolvedValue({
            data: [
              { id: 1, body: null },
              { id: 2, body: undefined },
            ],
          }),
          createComment: mockCreateComment,
          updateComment: vi.fn(),
        },
      },
    } as any);

    await upsertPrComment('new');

    // Should create new since no existing marker found
    expect(mockCreateComment).toHaveBeenCalled();
  });
});
