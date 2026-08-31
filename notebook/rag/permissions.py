from typing import Optional, Tuple
from .schemas import DocumentPermission, UserContext


def can_access_document(
    user_context: UserContext,
    permissions: Optional[DocumentPermission],
) -> bool:
    """
    Check whether a user has permission to access a document.
    Enforces strict tenant isolation and role/department checks.
    """
    if permissions is None:
        # Default: accessible within same tenant
        return True

    # 1. Strict Tenant Isolation (Company A user MUST NOT access Company B docs)
    if user_context.organization_id != permissions.organization_id:
        return False

    # 2. Public to the entire tenant organization
    if permissions.is_public:
        return True

    # If no specific restrictions are set, it is visible within organization
    if not permissions.allowed_departments and not permissions.allowed_roles:
        return True

    # 3. Department match
    if permissions.allowed_departments and user_context.department:
        if user_context.department in permissions.allowed_departments:
            return True

    # 4. Role match
    if permissions.allowed_roles and user_context.roles:
        user_roles_set = set(user_context.roles)
        if any(role in user_roles_set for role in permissions.allowed_roles):
            return True

    return False


def build_permission_filter_sql(user_context: UserContext) -> Tuple[str, dict]:
    """
    Build SQL WHERE clause conditions for pre-retrieval database-level filtering.
    """
    sql = """
        c.organization_id = %(org_id)s
        AND (
            d.is_public = TRUE
            OR (
                %(dept)s IS NOT NULL 
                AND cardinality(d.allowed_departments) > 0 
                AND %(dept)s = ANY(d.allowed_departments)
            )
            OR (
                cardinality(d.allowed_roles) > 0 
                AND %(roles)s && d.allowed_roles
            )
            OR (
                cardinality(d.allowed_departments) = 0 
                AND cardinality(d.allowed_roles) = 0
            )
        )
    """
    params = {
        "org_id": user_context.organization_id,
        "dept": user_context.department,
        "roles": user_context.roles,
    }
    return sql, params

