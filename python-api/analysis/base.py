from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")
import seaborn as sns
import japanize_matplotlib
import io
import base64
from datetime import datetime


class BaseAnalyzer(ABC):
    """全分析手法の基底クラス"""

    def __init__(self):
        self.results = None
        self.df = None
        self.setup_japanese_font()

    def setup_japanese_font(self):
        """日本語フォントを設定"""
        try:
            plt.rcParams["font.family"] = [
                "IPAexGothic",
                "IPAGothic",
                "DejaVu Sans",
                "sans-serif",
            ]
            plt.rcParams["axes.unicode_minus"] = False
        except Exception as e:
            print(f"Font setup warning: {e}")
            plt.rcParams["font.family"] = ["DejaVu Sans", "sans-serif"]
            plt.rcParams["axes.unicode_minus"] = False

    @abstractmethod
    def analyze(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """分析を実行する抽象メソッド"""
        pass

    @abstractmethod
    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """プロットを作成してBase64を返す抽象メソッド"""
        pass

    @abstractmethod
    def get_analysis_type(self) -> str:
        """分析手法の種類を返す"""
        pass

    def validate_data(self, df: pd.DataFrame) -> bool:
        """データの基本的な検証"""
        if df.empty:
            raise ValueError("空のデータフレームです")

        if df.isnull().all().all():
            raise ValueError("全ての値がNULLです")

        return True

    def preprocess_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """データの前処理（必要に応じてオーバーライド）"""
        # 基本的な前処理
        df_processed = df.copy()

        # 欠損値の処理（各分析手法で適切に処理）
        return df_processed

    def generate_summary_stats(self, df: pd.DataFrame) -> Dict[str, Any]:
        """基本統計情報を生成"""
        return {
            "shape": df.shape,
            "dtypes": df.dtypes.to_dict(),
            "missing_values": df.isnull().sum().to_dict(),
            "numeric_summary": (
                df.describe().to_dict()
                if len(df.select_dtypes(include=[np.number]).columns) > 0
                else {}
            ),
        }

    def save_plot_as_base64(self, fig) -> str:
        """MatplotlibのfigureをBase64文字列として保存"""
        buffer = io.BytesIO()
        fig.savefig(
            buffer,
            format="png",
            dpi=300,
            bbox_inches="tight",
            facecolor="white",
            edgecolor="none",
        )
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        plt.close(fig)
        return image_base64

    def create_common_plot_style(self):
        """共通のプロットスタイルを設定"""
        plt.rcParams.update(
            {
                "font.size": 12,
                "axes.labelsize": 14,
                "axes.titlesize": 16,
                "xtick.labelsize": 10,
                "ytick.labelsize": 10,
                "legend.fontsize": 12,
                "axes.titleweight": "bold",
                "axes.labelweight": "bold",
                "figure.facecolor": "#fcfcfc",
                "font.family": [
                    "IPAexGothic",
                    "IPAGothic",
                    "DejaVu Sans",
                    "sans-serif",
                ],
                "axes.unicode_minus": False,
            }
        )
        sns.set_style("whitegrid", {"grid.linestyle": ":"})
