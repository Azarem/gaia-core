/**
 * Supabase client configuration and initialization
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Database interface definitions based on Prisma schema
 * These types represent the structure of data returned from Supabase queries
 */
export interface Database {
  public: {
    Tables: {
      BaseRom: {
        Row: {
          id: string;
          name: string;
          gameId: string;
          gameRomId: string;
          createdAt: string;
          updatedAt: string;
        };
      };
      BaseRomBranch: {
        Row: {
          id: string;
          name: string | null;
          version: number | null;
          isPublic: boolean;
          baseRomId: string;
          gameRomBranchId: string;
          fileCrcs: number[];
          createdAt: string;
          updatedAt: string;
        };
      };
      GameRomBranch: {
        Row: {
          id: string;
          name: string | null;
          version: number | null;
          isPublic: boolean;
          gameRomId: string;
          platformBranchId: string;
          coplib: any | null;
          config: any | null;
          files: any | null;
          blocks: any | null;
          fixups: any | null;
          strings: any | null;
          structs: any | null;
          scenes: any | null;
          createdAt: string;
          updatedAt: string;
        };
      };
      GameRomBranchAsset: {
        Row: {
          id: string;
          name: string;
          type: string;
          gameRomBranchId: string;
          text: string | null;
          data: string | null;
          createdAt: string;
          updatedAt: string;
        };
      };
      PlatformBranch: {
        Row: {
          id: string;
          name: string | null;
          version: number | null;
          isPublic: boolean;
          platformId: string;
          addressingModes: any | null;
          instructionSet: any | null;
          vectors: any | null;
          createdAt: string;
          updatedAt: string;
        };
      };
      BaseRomFile: {
        Row: {
          id: string;
          name: string;
          type: string;
          version: number | null;
          crc: number | null;
          meta: any | null;
          baseRomId: string;
          data: string; // Base64 encoded binary data
          createdAt: string;
          updatedAt: string;
        };
      };
    };
  };
}

/**
 * Singleton Supabase client instance
 */
let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Create and configure a Supabase client instance
 * @returns Configured Supabase client
 */
export function createSupabaseClient(): SupabaseClient<Database> {
  // Validate required environment variables
  //validateEnvironmentVariables(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  
  const supabaseUrl = 'https://adwobxutnpmjbmhdxrzx.supabase.co';
  const supabaseAnonKey = 'sb_publishable_uBZdKmgGql5sDNGpj1DVMQ_opZ2V4kV';
  
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Disable auth for public data access
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      // Configure database connection
      schema: 'public',
    },
  });
}

/**
 * Get the singleton Supabase client instance
 * Creates the instance if it doesn't exist
 * @returns Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient();
  }
  return supabaseClient;
}

/**
 * Reset the singleton client instance (useful for testing)
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}

// /**
//  * Test the Supabase connection by performing a simple query
//  * @returns Promise that resolves to true if connection is successful
//  * @throws Error if connection fails
//  */
// export async function testSupabaseConnection(): Promise<boolean> {
//   try {
//     const client = getSupabaseClient();
    
//     // Perform a simple query to test the connection
//     const { data, error } = await client
//       .from('BaseRom')
//       .select('id')
//       .limit(1);
    
//     if (error) {
//       throw new Error(`Supabase connection test failed: ${error.message}`);
//     }
    
//     return true;
//   } catch (error) {
//     throw new Error(`Failed to connect to Supabase: ${error instanceof Error ? error.message : 'Unknown error'}`);
//   }
// }
