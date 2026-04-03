-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBranch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "version" INTEGER,
    "isActive" BOOLEAN,
    "notes" TEXT[],
    "platformId" TEXT NOT NULL,
    "addressingModes" JSONB,
    "vectors" JSONB,
    "types" JSONB,
    "headers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meta" JSONB,
    "platformId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameDeveloper" (
    "id" TEXT NOT NULL,
    "gameId" TEXT,
    "developerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameDeveloper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRom" (
    "id" TEXT NOT NULL,
    "crc" INTEGER NOT NULL,
    "meta" JSONB,
    "gameId" TEXT NOT NULL,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRomBranch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "version" INTEGER,
    "isActive" BOOLEAN,
    "notes" TEXT[],
    "gameRomId" TEXT NOT NULL,
    "platformBranchId" TEXT NOT NULL,
    "coplib" JSONB,
    "config" JSONB,
    "files" JSONB,
    "blocks" JSONB,
    "labels" JSONB,
    "rewrites" JSONB,
    "mnemonics" JSONB,
    "overrides" JSONB,
    "transforms" JSONB,
    "strings" JSONB,
    "structs" JSONB,
    "groups" JSONB,
    "fileTypes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRomBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRomArtifact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER,
    "crc" INTEGER,
    "meta" JSONB,
    "gameRomId" TEXT NOT NULL,
    "isText" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT,
    "data" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRomArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRomBranchArtifact" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,

    CONSTRAINT "GameRomBranchArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseRom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "gameRomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseRom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseRomBranch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "version" INTEGER,
    "isActive" BOOLEAN,
    "notes" TEXT[],
    "baseRomId" TEXT NOT NULL,
    "gameRomBranchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseRomBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseRomFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER,
    "crc" INTEGER,
    "meta" JSONB,
    "baseRomId" TEXT NOT NULL,
    "isText" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT,
    "data" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseRomFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseRomBranchFile" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "BaseRomBranchFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meta" JSONB,
    "gameId" TEXT NOT NULL,
    "baseRomId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBranch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "version" INTEGER,
    "isActive" BOOLEAN,
    "notes" TEXT[],
    "projectId" TEXT NOT NULL,
    "baseRomBranchId" TEXT NOT NULL,
    "modules" JSONB[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "module" TEXT,
    "version" INTEGER,
    "crc" INTEGER,
    "meta" JSONB,
    "projectId" TEXT NOT NULL,
    "isText" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT,
    "data" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBranchFile" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "ProjectBranchFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Platform_name_key" ON "Platform"("name");

-- CreateIndex
CREATE INDEX "PlatformBranch_platformId_name_idx" ON "PlatformBranch"("platformId", "name");

-- CreateIndex
CREATE INDEX "PlatformBranch_platformId_version_idx" ON "PlatformBranch"("platformId", "version");

-- CreateIndex
CREATE INDEX "PlatformBranch_platformId_isActive_idx" ON "PlatformBranch"("platformId", "isActive");

-- CreateIndex
CREATE INDEX "PlatformBranch_platformId_idx" ON "PlatformBranch"("platformId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBranch_platformId_name_key" ON "PlatformBranch"("platformId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBranch_platformId_version_key" ON "PlatformBranch"("platformId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBranch_platformId_isActive_key" ON "PlatformBranch"("platformId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Developer_name_key" ON "Developer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE INDEX "Game_platformId_idx" ON "Game"("platformId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_platformId_name_key" ON "Game"("platformId", "name");

-- CreateIndex
CREATE INDEX "GameDeveloper_gameId_idx" ON "GameDeveloper"("gameId");

-- CreateIndex
CREATE INDEX "GameDeveloper_developerId_idx" ON "GameDeveloper"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRom_crc_key" ON "GameRom"("crc");

-- CreateIndex
CREATE INDEX "GameRom_gameId_idx" ON "GameRom"("gameId");

-- CreateIndex
CREATE INDEX "GameRom_regionId_idx" ON "GameRom"("regionId");

-- CreateIndex
CREATE INDEX "GameRomBranch_gameRomId_name_idx" ON "GameRomBranch"("gameRomId", "name");

-- CreateIndex
CREATE INDEX "GameRomBranch_gameRomId_version_idx" ON "GameRomBranch"("gameRomId", "version");

-- CreateIndex
CREATE INDEX "GameRomBranch_gameRomId_isActive_idx" ON "GameRomBranch"("gameRomId", "isActive");

-- CreateIndex
CREATE INDEX "GameRomBranch_gameRomId_idx" ON "GameRomBranch"("gameRomId");

-- CreateIndex
CREATE INDEX "GameRomBranch_platformBranchId_idx" ON "GameRomBranch"("platformBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRomBranch_gameRomId_name_key" ON "GameRomBranch"("gameRomId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GameRomBranch_gameRomId_version_key" ON "GameRomBranch"("gameRomId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GameRomBranch_gameRomId_isActive_key" ON "GameRomBranch"("gameRomId", "isActive");

-- CreateIndex
CREATE INDEX "GameRomArtifact_gameRomId_crc_idx" ON "GameRomArtifact"("gameRomId", "crc");

-- CreateIndex
CREATE INDEX "GameRomArtifact_gameRomId_idx" ON "GameRomArtifact"("gameRomId");

-- CreateIndex
CREATE INDEX "GameRomArtifact_crc_idx" ON "GameRomArtifact"("crc");

-- CreateIndex
CREATE UNIQUE INDEX "GameRomArtifact_gameRomId_name_version_key" ON "GameRomArtifact"("gameRomId", "name", "version");

-- CreateIndex
CREATE INDEX "GameRomBranchArtifact_branchId_idx" ON "GameRomBranchArtifact"("branchId");

-- CreateIndex
CREATE INDEX "GameRomBranchArtifact_artifactId_idx" ON "GameRomBranchArtifact"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRomBranchArtifact_branchId_artifactId_key" ON "GameRomBranchArtifact"("branchId", "artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRom_name_key" ON "BaseRom"("name");

-- CreateIndex
CREATE INDEX "BaseRom_gameId_name_idx" ON "BaseRom"("gameId", "name");

-- CreateIndex
CREATE INDEX "BaseRom_gameId_idx" ON "BaseRom"("gameId");

-- CreateIndex
CREATE INDEX "BaseRom_gameRomId_idx" ON "BaseRom"("gameRomId");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRom_gameId_name_key" ON "BaseRom"("gameId", "name");

-- CreateIndex
CREATE INDEX "BaseRomBranch_baseRomId_name_idx" ON "BaseRomBranch"("baseRomId", "name");

-- CreateIndex
CREATE INDEX "BaseRomBranch_baseRomId_version_idx" ON "BaseRomBranch"("baseRomId", "version");

-- CreateIndex
CREATE INDEX "BaseRomBranch_baseRomId_isActive_idx" ON "BaseRomBranch"("baseRomId", "isActive");

-- CreateIndex
CREATE INDEX "BaseRomBranch_baseRomId_idx" ON "BaseRomBranch"("baseRomId");

-- CreateIndex
CREATE INDEX "BaseRomBranch_gameRomBranchId_idx" ON "BaseRomBranch"("gameRomBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRomBranch_baseRomId_name_key" ON "BaseRomBranch"("baseRomId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRomBranch_baseRomId_version_key" ON "BaseRomBranch"("baseRomId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRomBranch_baseRomId_isActive_key" ON "BaseRomBranch"("baseRomId", "isActive");

-- CreateIndex
CREATE INDEX "BaseRomFile_baseRomId_crc_idx" ON "BaseRomFile"("baseRomId", "crc");

-- CreateIndex
CREATE INDEX "BaseRomFile_baseRomId_idx" ON "BaseRomFile"("baseRomId");

-- CreateIndex
CREATE INDEX "BaseRomFile_crc_idx" ON "BaseRomFile"("crc");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRomFile_baseRomId_name_version_key" ON "BaseRomFile"("baseRomId", "name", "version");

-- CreateIndex
CREATE INDEX "BaseRomBranchFile_branchId_idx" ON "BaseRomBranchFile"("branchId");

-- CreateIndex
CREATE INDEX "BaseRomBranchFile_fileId_idx" ON "BaseRomBranchFile"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "BaseRomBranchFile_branchId_fileId_key" ON "BaseRomBranchFile"("branchId", "fileId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE INDEX "Project_name_idx" ON "Project"("name");

-- CreateIndex
CREATE INDEX "Project_gameId_idx" ON "Project"("gameId");

-- CreateIndex
CREATE INDEX "Project_baseRomId_idx" ON "Project"("baseRomId");

-- CreateIndex
CREATE INDEX "ProjectBranch_projectId_name_idx" ON "ProjectBranch"("projectId", "name");

-- CreateIndex
CREATE INDEX "ProjectBranch_projectId_version_idx" ON "ProjectBranch"("projectId", "version");

-- CreateIndex
CREATE INDEX "ProjectBranch_projectId_isActive_idx" ON "ProjectBranch"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "ProjectBranch_projectId_idx" ON "ProjectBranch"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBranch_baseRomBranchId_idx" ON "ProjectBranch"("baseRomBranchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBranch_projectId_name_key" ON "ProjectBranch"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBranch_projectId_version_key" ON "ProjectBranch"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBranch_projectId_isActive_key" ON "ProjectBranch"("projectId", "isActive");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_crc_idx" ON "ProjectFile"("projectId", "crc");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_idx" ON "ProjectFile"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFile_projectId_module_name_version_key" ON "ProjectFile"("projectId", "module", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFile_projectId_module_crc_key" ON "ProjectFile"("projectId", "module", "crc");

-- CreateIndex
CREATE INDEX "ProjectBranchFile_branchId_idx" ON "ProjectBranchFile"("branchId");

-- CreateIndex
CREATE INDEX "ProjectBranchFile_fileId_idx" ON "ProjectBranchFile"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBranchFile_branchId_fileId_key" ON "ProjectBranchFile"("branchId", "fileId");

-- AddForeignKey
ALTER TABLE "PlatformBranch" ADD CONSTRAINT "PlatformBranch_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameDeveloper" ADD CONSTRAINT "GameDeveloper_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameDeveloper" ADD CONSTRAINT "GameDeveloper_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRom" ADD CONSTRAINT "GameRom_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRom" ADD CONSTRAINT "GameRom_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRomBranch" ADD CONSTRAINT "GameRomBranch_gameRomId_fkey" FOREIGN KEY ("gameRomId") REFERENCES "GameRom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRomBranch" ADD CONSTRAINT "GameRomBranch_platformBranchId_fkey" FOREIGN KEY ("platformBranchId") REFERENCES "PlatformBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRomArtifact" ADD CONSTRAINT "GameRomArtifact_gameRomId_fkey" FOREIGN KEY ("gameRomId") REFERENCES "GameRom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRomBranchArtifact" ADD CONSTRAINT "GameRomBranchArtifact_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "GameRomBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRomBranchArtifact" ADD CONSTRAINT "GameRomBranchArtifact_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "GameRomArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRom" ADD CONSTRAINT "BaseRom_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRom" ADD CONSTRAINT "BaseRom_gameRomId_fkey" FOREIGN KEY ("gameRomId") REFERENCES "GameRom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRomBranch" ADD CONSTRAINT "BaseRomBranch_baseRomId_fkey" FOREIGN KEY ("baseRomId") REFERENCES "BaseRom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRomBranch" ADD CONSTRAINT "BaseRomBranch_gameRomBranchId_fkey" FOREIGN KEY ("gameRomBranchId") REFERENCES "GameRomBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRomFile" ADD CONSTRAINT "BaseRomFile_baseRomId_fkey" FOREIGN KEY ("baseRomId") REFERENCES "BaseRom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRomBranchFile" ADD CONSTRAINT "BaseRomBranchFile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "BaseRomBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseRomBranchFile" ADD CONSTRAINT "BaseRomBranchFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "BaseRomFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_baseRomId_fkey" FOREIGN KEY ("baseRomId") REFERENCES "BaseRom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBranch" ADD CONSTRAINT "ProjectBranch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBranch" ADD CONSTRAINT "ProjectBranch_baseRomBranchId_fkey" FOREIGN KEY ("baseRomBranchId") REFERENCES "BaseRomBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFile" ADD CONSTRAINT "ProjectFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBranchFile" ADD CONSTRAINT "ProjectBranchFile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProjectBranch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBranchFile" ADD CONSTRAINT "ProjectBranchFile_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProjectFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


DO $$
BEGIN
  -- Check if we're in a Supabase/production environment by looking for specific extensions
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') OR
     EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    
    GRANT USAGE ON SCHEMA public TO anon;

    -- Grant SELECT permissions on all tables to anonymous role
    GRANT SELECT ON TABLE public."Game" TO anon;
    GRANT SELECT ON TABLE public."GameRom" TO anon;
    GRANT SELECT ON TABLE public."GameRomArtifact" TO anon;
    GRANT SELECT ON TABLE public."GameRomBranchArtifact" TO anon;
    GRANT SELECT ON TABLE public."GameDeveloper" TO anon;
    GRANT SELECT ON TABLE public."Platform" TO anon;
    GRANT SELECT ON TABLE public."PlatformBranch" TO anon;
    GRANT SELECT ON TABLE public."Developer" TO anon;
    GRANT SELECT ON TABLE public."Region" TO anon;
    GRANT SELECT ON TABLE public."GameRomBranch" TO anon;
    GRANT SELECT ON TABLE public."BaseRom" TO anon;
    GRANT SELECT ON TABLE public."BaseRomBranch" TO anon;
    GRANT SELECT ON TABLE public."BaseRomFile" TO anon;
    GRANT SELECT ON TABLE public."BaseRomBranchFile" TO anon;
    GRANT SELECT ON TABLE public."Project" TO anon;
    GRANT SELECT ON TABLE public."ProjectBranch" TO anon;
    GRANT SELECT ON TABLE public."ProjectFile" TO anon;
    GRANT SELECT ON TABLE public."ProjectBranchFile" TO anon;

    -- Enable Row Level Security on all tables
    ALTER TABLE "Game" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "GameRom" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "GameRomArtifact" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "GameRomBranchArtifact" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "GameDeveloper" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Platform" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "PlatformBranch" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Developer" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Region" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "GameRomBranch" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "BaseRom" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "BaseRomBranch" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "BaseRomFile" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "BaseRomBranchFile" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ProjectBranch" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ProjectFile" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "ProjectBranchFile" ENABLE ROW LEVEL SECURITY;

    -- Create anonymous SELECT policies for all tables
    CREATE POLICY "Anonymous can read games" ON "Game" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read game roms" ON "GameRom" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read game rom artifacts" ON "GameRomArtifact" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read game rom branch artifacts" ON "GameRomBranchArtifact" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read game developers" ON "GameDeveloper" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read game rom branches" ON "GameRomBranch" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read baseroms" ON "BaseRom" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read base rom branches" ON "BaseRomBranch" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read base rom files" ON "BaseRomFile" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read base rom branch files" ON "BaseRomBranchFile" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read platforms" ON "Platform" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read platform branches" ON "PlatformBranch" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read developers" ON "Developer" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read regions" ON "Region" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read projects" ON "Project" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read project branches" ON "ProjectBranch" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read project files" ON "ProjectFile" FOR SELECT TO anon USING (true);
    CREATE POLICY "Anonymous can read project branch files" ON "ProjectBranchFile" FOR SELECT TO anon USING (true);

    RAISE NOTICE 'Applied RLS policies and grants for production environment';
  ELSE
    RAISE NOTICE 'Skipped RLS setup - not in production environment';
  END IF;
END
$$;
