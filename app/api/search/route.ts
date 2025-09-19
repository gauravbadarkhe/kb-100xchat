import { NextRequest, NextResponse } from 'next/server'
import { search } from '../../../src/util'
import { withAuth, createErrorResponse, createSuccessResponse } from '@/src/auth/middleware'
import { projectsRepo } from '@/src/auth/repositories'

// Get user's accessible repositories based on their projects
async function getUserRepositories(organizationId: number): Promise<string[]> {
  try {
    const projects = await projectsRepo.findActive(organizationId);
    
    // Get all repositories from the database that are linked to projects
    const { db } = await import('../../../src/db');
    const result = await db.query(`
      SELECT DISTINCT d.repo_full
      FROM documents d
      JOIN projects p ON d.project_id = p.id
      WHERE p.organization_id = $1 AND p.is_active = true
    `, [organizationId]);
    
    return result.rows.map(row => row.repo_full);
  } catch (error) {
    console.error('Error getting user repositories:', error);
    return [];
  }
}

export const GET = withAuth(async (request) => {
  try {
    const { authContext } = request;
    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q') || ''
    
    if (!q) {
      return createErrorResponse('Missing search query', 400);
    }
    
    const k = Number(searchParams.get('k') || 8)
    
    // Get user's accessible repositories
    const organizationRepos = await getUserRepositories(authContext.organization_id);
    
    if (organizationRepos.length === 0) {
      return createSuccessResponse([]);
    }
    
    // TODO: Update the search function to accept repository filter
    // For now, we'll use the existing search function and filter results
    const results = await search(q, k * 2); // Get more results to account for filtering
    
    // Filter results to only include repositories the user has access to
    const filteredResults = results.filter((result: any) => 
      organizationRepos.includes(result.repo)
    ).slice(0, k); // Limit to requested number
    
    return createSuccessResponse(filteredResults);
  } catch (error: any) {
    console.error('Search error:', error)
    return createErrorResponse('Search failed', 500, error?.message || 'unknown');
  }
});
