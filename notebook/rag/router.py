import enum
import re


class RouteType(str, enum.Enum):
    COMPANY_RAG = "COMPANY_RAG"
    WEB_SEARCH = "WEB_SEARCH"
    BOTH = "BOTH"
    DIRECT_LLM = "DIRECT_LLM"


FRESHNESS_PATTERN = re.compile(
    r"\b(latest|current|recent|today|tonight|yesterday|tomorrow|this week|"
    r"this month|this year|newest|breaking|live|currently|recently|news|"
    r"price|prices|release|released|announced|announcement|stock|weather)\b",
    re.IGNORECASE,
)

COMPANY_PATTERN = re.compile(
    r"\b(our policy|company policy|our company|leave policy|handbook|employee handbook|"
    r"casual leave|sick leave|parental leave|maternity|paternity|vacation policy|"
    r"hr policy|reimbursement|travel policy|code of conduct|internal wiki|"
    r"internal docs|internal policy|onboarding|wfh policy|remote work policy|"
    r"expense policy|appraisal|nda|posh|insurance coverage|salary slip|notice period)\b",
    re.IGNORECASE,
)


class QueryRouter:
    """Deterministic routing between COMPANY_RAG, WEB_SEARCH, BOTH, and DIRECT_LLM."""

    @staticmethod
    def is_freshness_query(query: str) -> bool:
        return bool(FRESHNESS_PATTERN.search(query))

    @staticmethod
    def is_company_query(query: str) -> bool:
        return bool(COMPANY_PATTERN.search(query))

    @classmethod
    def route(cls, query: str) -> RouteType:
        if not query or not query.strip():
            return RouteType.DIRECT_LLM

        has_freshness = cls.is_freshness_query(query)
        has_company = cls.is_company_query(query)

        if has_freshness and has_company:
            return RouteType.BOTH
        elif has_company:
            return RouteType.COMPANY_RAG
        elif has_freshness:
            return RouteType.WEB_SEARCH
        else:
            return RouteType.DIRECT_LLM

