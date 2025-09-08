#!/bin/bash

# Configuration
CONTAINER_NAME="postgresql"
DB_USER="postgres"
GENERIC_DB_NAME="NFCBackend"
TENANT_DB_SUFFIX="tenant_"
TENANT_ROLE_SUFFIX="u_"
TENANT_ORG_NAMES=("idk" "idk1" "idk2" "cardedeu" "llinars")
DB_PASSWORD="s"
PROJECT_FOLDER="/home/adri/Documentos/development/NFCheckin_Backend/"
MIGRATIONS_FOLDER="/home/adri/Documentos/development/NFCheckin_Backend/NFCheckin_Backend.PostgreSQLRepository/Migrations/"

execute_sql() {
    local query="$1"
    local database="$2"
    if [ -z "$database" ]; then
        database="postgres"
    fi

    echo "Executing SQL query: $query"
    
    if ! sudo docker ps | grep -q "$CONTAINER_NAME"; then
        echo "Starting container $CONTAINER_NAME..."
        sudo docker start "$CONTAINER_NAME"
        sleep 2
    fi
    
    sudo docker exec -i "$CONTAINER_NAME" bash -c "PGPASSWORD='$DB_PASSWORD' psql -U '$DB_USER' -d '$database' -c '$query'"
}

drop_tenant_database() {
    local org_name="$1"
    local db_name="${TENANT_DB_SUFFIX}${org_name}"
    local role_name="${TENANT_ROLE_SUFFIX}${org_name}"
    
    echo "Processing tenant: $org_name"
    
    execute_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db_name';" >/dev/null 2>&1
    execute_sql "DROP DATABASE IF EXISTS \"$db_name\";" >/dev/null 2>&1
    execute_sql "DROP ROLE IF EXISTS \"$role_name\";" >/dev/null 2>&1
    
    echo "  ✓ Database $db_name and role $role_name dropped (if they existed)"
}

drop_generic_database() {
    echo "Dropping generic database: $GENERIC_DB_NAME"

    execute_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$GENERIC_DB_NAME';" >/dev/null 2>&1
    execute_sql "DROP DATABASE \"$GENERIC_DB_NAME\";" >/dev/null 1>&1
    
    echo "  ✓ Generic database $GENERIC_DB_NAME dropped."
}

remove_folder() {
    local folder_path="$1"
    
    if [ -d "$folder_path" ]; then
        echo "Removing folder: $folder_path"
        rm -rf "$folder_path" 2>/dev/null
        echo "✓ Folder removed successfully"
    else
        echo "Folder does not exist: $folder_path"
    fi
}

init_migration(){
    local project_root=$PROJECT_FOLDER;
    cd $project_root;
    dotnet ef migrations add InitialCreateGeneric --project NFCheckin_Backend.PostgreSQLRepository --startup-project NFCheckin_Backend.Api/NFCheckin_Backend.Api --context NfCheckinBackendDbContext --output-dir Migrations/Generic;
    dotnet ef database update --project NFCheckin_Backend.PostgreSQLRepository --startup-project NFCheckin_Backend.Api/NFCheckin_Backend.Api --context NfCheckinBackendDbContext;
    dotnet ef migrations add InitialTenantCreate --project NFCheckin_Backend.PostgreSQLRepository --startup-project NFCheckin_Backend.Api/NFCheckin_Backend.Api --context NfCheckinBackendOrganizationDbContext --output-dir Migrations/Tenant;

}

# Main function
main() {
    local skip_db=false
    local skip_folder=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-db)
                skip_db=true
                shift
                ;;
            --skip-folder)
                skip_folder=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [--skip-db] [--skip-folder]"
                echo "  --skip-db     Skip database operations"
                echo "  --skip-folder Skip folder removal"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    echo "=== Database Cleanup Script ==="
    
    if [ "$skip_db" = false ]; then
        echo "Dropping tenant databases..."
        for org_name in "${TENANT_ORG_NAMES[@]}"; do
            drop_tenant_database "$org_name"
        done
        echo "✓ All tenant databases processed"
        
        echo "Dropping generic database..."
        drop_generic_database
    else
        echo "Skipping database operations..."
    fi
    
    if [ "$skip_folder" = false ]; then
        echo "Removing local folder..."
        remove_folder "$MIGRATIONS_FOLDER"
	init_migration
    else
        echo "Skipping folder removal..."
    fi
    
    echo "=== Cleanup completed ==="
}

main "$@"
