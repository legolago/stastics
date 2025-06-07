"""
Analysis module for multivariate statistical analysis
"""

from .base import BaseAnalyzer
from .correspondence import CorrespondenceAnalyzer
from .factor import FactorAnalysisAnalyzer

__all__ = [
    "BaseAnalyzer",
    "CorrespondenceAnalyzer",
    "FactorAnalysisAnalyzer",
]
