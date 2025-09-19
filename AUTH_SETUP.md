# Authentication & Organization Setup Guide

This guide will help you set up the new authentication and organization system for your knowledge base project.

## Overview

The system now supports:
- **Multi-tenant organizations** - Each organization has its own users, projects, and data
- **User authentication** - Username/password with Supabase (Google/SSO coming later)
- **Role-based access control** - Admin, Member, and Viewer roles
- **Project management** - Organized by organization with advanced settings
- **Data source management** - Connect GitHub, BitBucket, documentation sites, etc.

## Prerequisites

1. **PostgreSQL Database** - Your existing database will be extended with new tables
2. **Supabase Account** - For authentication (free tier available)
3. **Node.js 18+** - Required for the application

## Setup Instructions

### 1. Set Up Supabase

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Once your project is ready, go to **Settings** → **API**
3. Copy the following values:
   - **Project URL** (e.g., `https://your-project-ref.supabase.co`)
   - **Anon/Public Key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`)
   - **Service Role Key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9`)

### 2. Configure Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Database Configuration (your existing DATABASE_URL)
DATABASE_URL=postgresql://username:password@localhost:5432/your_database

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Existing Configuration
OPENAI_API_KEY=your-openai-api-key
# ... other existing environment variables
```

### 3. Run Database Migration

Run the authentication migration to add the new tables:

```bash
npm run migrate:auth
```

This will add the following tables to your existing database:
- `organizations` - Company/team organizations
- `users` - User accounts linked to Supabase auth
- `sources` - Data source connections (GitHub, etc.)
- `projects` - Knowledge base projects
- Extended `documents` and `chunks` tables with organization links

### 4. Supabase Authentication Setup

In your Supabase dashboard:

1. Go to **Authentication** → **Settings**
2. Configure the following:
   - **Site URL**: `http://localhost:3000` (development) or your production URL
   - **Redirect URLs**: Add your application URLs
   - Enable **Email** authentication
   - Disable **Confirm email** for development (optional)

### 5. Test the Setup

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:3000`

3. You should see the new authentication flow:
   - Login/Signup forms
   - Organization creation for new users
   - Dashboard with projects and sources management

## User Roles

### Admin
- Full access to organization settings
- Can invite/remove users and change roles
- Can create/edit/delete projects and sources
- Can manage all organization data

### Member
- Can create/edit/delete projects and sources
- Can view organization members
- Cannot manage users or organization settings

### Viewer
- Can view and search projects
- Cannot create or modify data
- Read-only access to the knowledge base

## Architecture Overview

### Database Schema
```
organizations (1) → (many) users
organizations (1) → (many) projects
organizations (1) → (many) sources
projects (many) → (1) sources (optional)
projects (1) → (many) documents
documents (1) → (many) chunks
```

### Authentication Flow
1. User signs up/signs in through Supabase
2. If new user, they create an organization (become admin)
3. If existing user, they're directed to their organization dashboard
4. All subsequent API calls are authenticated and scoped to their organization

### API Routes

#### Authentication
- `POST /api/auth/signin` - Sign in user
- `POST /api/auth/signup` - Sign up new user
- `POST /api/auth/signout` - Sign out user

#### Organizations
- `GET /api/organizations` - Get current organization
- `POST /api/organizations` - Create organization
- `PUT /api/organizations` - Update organization (admin only)

#### Users
- `GET /api/users` - Get organization members
- `POST /api/users` - Invite user (admin only)
- `PUT /api/users/[userId]` - Update user role (admin only)
- `DELETE /api/users/[userId]` - Remove user (admin only)

#### Projects
- `GET /api/projects` - Get organization projects
- `POST /api/projects` - Create project (member+ only)
- `GET /api/projects/[projectId]` - Get specific project
- `PUT /api/projects/[projectId]` - Update project (member+ only)
- `DELETE /api/projects/[projectId]` - Delete project (member+ only)

#### Sources
- `GET /api/sources` - Get organization sources
- `POST /api/sources` - Create source (member+ only)
- `GET /api/sources/[sourceId]` - Get specific source
- `PUT /api/sources/[sourceId]` - Update source (member+ only)
- `DELETE /api/sources/[sourceId]` - Delete source (member+ only)

## Migrating Existing Data

If you have existing documents and chunks in your database, you'll need to:

1. Create an organization for your existing data
2. Create a default project for that organization
3. Update existing documents to link to the project:

```sql
-- Example migration for existing data
INSERT INTO organizations (name, description) VALUES ('Default Organization', 'Migrated from legacy system');

INSERT INTO projects (organization_id, created_by, name, description) 
SELECT 1, 1, 'Legacy Project', 'Migrated documents from previous system';

UPDATE documents SET project_id = 1, created_by = 1 WHERE project_id IS NULL;
```

## Troubleshooting

### Common Issues

1. **Migration fails with "relation already exists"**
   - This is normal if you run the migration multiple times
   - The script will continue with other statements

2. **Supabase authentication not working**
   - Check that your environment variables are correct
   - Verify your Supabase project is active
   - Check the browser console for CORS errors

3. **Users can't create organizations**
   - Ensure the `organizations` table was created successfully
   - Check that the user has a valid Supabase session

4. **API routes return 401/403 errors**
   - Verify the user is authenticated
   - Check that the user belongs to the correct organization
   - Ensure proper role permissions

### Getting Help

If you encounter issues:

1. Check the browser console for client-side errors
2. Check your server logs for API errors
3. Verify your database schema matches the expected structure
4. Test your Supabase connection in the Supabase dashboard

## Next Steps

After setup is complete:

1. **Create your first organization** and invite team members
2. **Set up data sources** to connect your repositories
3. **Create projects** to organize your knowledge base
4. **Configure indexing settings** for optimal search results
5. **Set up automated syncing** for your data sources

## Security Considerations

- Store sensitive configuration (tokens, keys) in environment variables
- Regularly rotate API keys and access tokens
- Use the principle of least privilege for user roles
- Enable Supabase security features (RLS, email verification) for production
- Consider implementing SSO for enterprise use cases
