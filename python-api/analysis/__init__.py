"""
統計分析パッケージ

このパッケージには各種統計分析手法のAnalyzerクラスが含まれています。
全てのAnalyzerはBaseAnalyzerクラスを継承し、統一されたインターフェースを提供します。
"""

from .base import BaseAnalyzer
from .correspondence import CorrespondenceAnalyzer

__all__ = [
    "BaseAnalyzer",
    "CorrespondenceAnalyzer",
]

# 将来追加予定の分析手法
# from .pca import PCAAnalyzer
# from .factor import FactorAnalyzer
# from .cluster import ClusterAnalyzer

# バージョン情報
__version__ = "1.0.0"
