# python-api/analysis/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib

matplotlib.use("Agg")
import matplotlib.patheffects as pe
import japanize_matplotlib
import seaborn as sns
import io
import base64
from datetime import datetime
from sqlalchemy.orm import Session

# modelsとデータベース関連のインポート
from models import (
    AnalysisSession,
    OriginalData,
    CoordinatesData,
    VisualizationData,
    EigenvalueData,
)


class BaseAnalyzer(ABC):
    """全分析手法の基底クラス"""

    def __init__(self):
        self.results = None
        self.df = None
        self.setup_japanese_font()

    def setup_japanese_font(self):
        """日本語フォントを設定"""
        try:
            plt.rcParams.update(
                {
                    "font.family": [
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                    "axes.unicode_minus": False,
                    "font.size": 12,
                }
            )

            # フォントキャッシュをクリア
            import matplotlib.font_manager as fm

            fm.fontManager.__init__()

            print("Japanese font setup completed")
        except Exception as e:
            print(f"Font setup warning: {e}")
            plt.rcParams.update(
                {
                    "font.family": ["DejaVu Sans", "sans-serif"],
                    "axes.unicode_minus": False,
                }
            )

    @abstractmethod
    def get_analysis_type(self) -> str:
        """分析手法の種類を返す"""
        pass

    @abstractmethod
    def analyze(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """分析を実行する抽象メソッド"""
        pass

    @abstractmethod
    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """プロットを作成してBase64を返す抽象メソッド"""
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
        df_processed = df.copy()

        # 数値型に変換
        for col in df_processed.columns:
            df_processed[col] = pd.to_numeric(df_processed[col], errors="coerce")

        # NaNを0で埋める
        df_processed = df_processed.fillna(0)

        # 負の値を絶対値に変換
        df_processed = df_processed.abs()

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
        """プロットをBase64エンコードした文字列として保存"""
        # 図を保存する前に日本語フォントを強制設定
        plt.rcParams.update(
            {
                "font.family": [
                    "IPAexGothic",
                    "IPAGothic",
                    "DejaVu Sans",
                    "sans-serif",
                ],
                "axes.unicode_minus": False,
            }
        )

        # 既存の全てのテキストオブジェクトのフォントを更新
        for ax in fig.get_axes():
            # タイトル、軸ラベルのフォントを明示的に設定
            if hasattr(ax.title, "set_fontfamily"):
                ax.title.set_fontfamily(
                    ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                )
            if hasattr(ax.xaxis.label, "set_fontfamily"):
                ax.xaxis.label.set_fontfamily(
                    ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                )
            if hasattr(ax.yaxis.label, "set_fontfamily"):
                ax.yaxis.label.set_fontfamily(
                    ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                )

            # 軸の目盛りラベル
            for label in ax.get_xticklabels() + ax.get_yticklabels():
                if hasattr(label, "set_fontfamily"):
                    label.set_fontfamily(
                        ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                    )

            # 凡例
            legend = ax.get_legend()
            if legend:
                for text in legend.get_texts():
                    if hasattr(text, "set_fontfamily"):
                        text.set_fontfamily(
                            ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                        )
                if hasattr(legend.get_title(), "set_fontfamily"):
                    legend.get_title().set_fontfamily(
                        ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                    )

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
                "figure.facecolor": "white",
                "font.family": [
                    "IPAexGothic",
                    "IPAGothic",
                    "DejaVu Sans",
                    "sans-serif",
                ],
                "axes.unicode_minus": False,
            }
        )

    def save_to_database(
        self,
        db: Session,
        session_name: str,
        description: Optional[str],
        tags: List[str],
        user_id: str,
        file,
        csv_text: str,
        df: pd.DataFrame,
        results: Dict[str, Any],
        plot_base64: str,
    ) -> int:
        """データベースに保存（共通処理）"""
        try:
            print("=== データベース保存開始 ===")

            # 分析タイプに応じたchi2_valueとdegrees_of_freedomの設定
            analysis_type = self.get_analysis_type()

            if analysis_type == "pca":
                # PCAの場合: KMO値をchi2_valueに、主成分数をdegrees_of_freedomに保存
                chi2_value = results.get("kmo", 0.0)
                degrees_of_freedom = results.get("n_components", 0)
            elif analysis_type == "factor":
                # 因子分析の場合の設定（将来の実装用）
                chi2_value = results.get("chi2", 0.0)
                degrees_of_freedom = results.get("n_factors", 0)
            else:
                # コレスポンデンス分析の場合（デフォルト）
                chi2_value = results.get("chi2", 0.0)
                degrees_of_freedom = results.get("degrees_of_freedom", 0)

            # セッション作成
            session = AnalysisSession(
                session_name=session_name,
                description=description or "",
                tags=tags,
                user_id=user_id,
                original_filename=file.filename,
                analysis_timestamp=datetime.utcnow(),
                analysis_type=analysis_type,
                row_count=df.shape[0],
                column_count=df.shape[1],
                total_inertia=results.get("total_inertia", 0.0),
                chi2_value=chi2_value,
                degrees_of_freedom=degrees_of_freedom,
            )

            db.add(session)
            db.flush()
            session_id = session.id

            print(f"セッション作成完了: ID={session_id}, Type={analysis_type}")

            # 各種データの保存
            self._save_original_data(db, session_id, csv_text, df)
            self._save_coordinates_data(db, session_id, df, results)
            self._save_eigenvalues_data(db, session_id, results)
            self._save_visualization_data(db, session_id, plot_base64)

            db.commit()
            print(f"データベース保存完了: session_id={session_id}")
            return session_id

        except Exception as e:
            print(f"データベース保存で致命的エラー: {str(e)}")
            db.rollback()
            return 0

    def _save_original_data(
        self, db: Session, session_id: int, csv_text: str, df: pd.DataFrame
    ):
        """元データの保存"""
        try:
            original_data = OriginalData(
                session_id=session_id,
                csv_data=csv_text,
                data_matrix=df.values.tolist(),
                row_names=df.index.tolist(),
                column_names=df.columns.tolist(),
            )
            db.add(original_data)
        except Exception as e:
            print(f"元データ保存エラー: {e}")

    def _save_coordinates_data(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """座標データの保存（各分析手法で個別実装可能）"""
        try:
            analysis_type = self.get_analysis_type()

            if analysis_type == "correspondence":
                # コレスポンデンス分析の座標保存
                self._save_correspondence_coordinates(db, session_id, df, results)
            elif analysis_type == "pca":
                # PCA分析の座標保存
                self._save_pca_coordinates(db, session_id, df, results)
            elif analysis_type == "factor":
                # 因子分析の座標保存
                self._save_factor_coordinates(db, session_id, df, results)
            else:
                # デフォルト（旧来の方式）
                self._save_default_coordinates(db, session_id, df, results)

        except Exception as e:
            print(f"座標データ保存エラー: {e}")

    def _save_correspondence_coordinates(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """コレスポンデンス分析の座標データ保存"""
        row_coords = results.get("row_coordinates")
        col_coords = results.get("column_coordinates")

        if row_coords is not None:
            for i, name in enumerate(df.index):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(name),
                    point_type="row",
                    dimension_1=(
                        float(row_coords[i, 0]) if row_coords.shape[1] > 0 else 0.0
                    ),
                    dimension_2=(
                        float(row_coords[i, 1]) if row_coords.shape[1] > 1 else 0.0
                    ),
                )
                db.add(coord_data)

        if col_coords is not None:
            for i, name in enumerate(df.columns):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(name),
                    point_type="column",
                    dimension_1=(
                        float(col_coords[i, 0]) if col_coords.shape[1] > 0 else 0.0
                    ),
                    dimension_2=(
                        float(col_coords[i, 1]) if col_coords.shape[1] > 1 else 0.0
                    ),
                )
                db.add(coord_data)

    def _save_pca_coordinates(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """PCA分析の座標データ保存"""
        component_scores = results.get("component_scores")
        loadings = results.get("loadings")
        sample_names = results.get("sample_names", df.index.tolist())
        feature_names = results.get("feature_names", df.columns.tolist())

        # 主成分得点の保存（観測値として）
        if component_scores is not None:
            for i, name in enumerate(sample_names):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(name),
                    point_type="observation",  # PCA用の観測値
                    dimension_1=(
                        float(component_scores[i, 0])
                        if component_scores.shape[1] > 0
                        else 0.0
                    ),
                    dimension_2=(
                        float(component_scores[i, 1])
                        if component_scores.shape[1] > 1
                        else 0.0
                    ),
                )
                db.add(coord_data)

        # 主成分負荷量の保存（変数として）
        if loadings is not None:
            for i, name in enumerate(feature_names):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(name),
                    point_type="variable",  # PCA用の変数
                    dimension_1=(
                        float(loadings[i, 0]) if loadings.shape[1] > 0 else 0.0
                    ),
                    dimension_2=(
                        float(loadings[i, 1]) if loadings.shape[1] > 1 else 0.0
                    ),
                )
                db.add(coord_data)

    def _save_factor_coordinates(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """因子分析の座標データ保存（将来の実装用）"""
        # 因子分析の場合の実装
        # factor_scores = results.get("factor_scores")
        # factor_loadings = results.get("factor_loadings")
        # など...
        pass

    def _save_default_coordinates(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """デフォルトの座標データ保存（旧来の方式）"""
        row_coords = results.get("row_coordinates")
        col_coords = results.get("column_coordinates")

        if row_coords is not None:
            for i, name in enumerate(df.index):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(name),
                    point_type="row",
                    dimension_1=(
                        float(row_coords[i, 0]) if row_coords.shape[1] > 0 else 0.0
                    ),
                    dimension_2=(
                        float(row_coords[i, 1]) if row_coords.shape[1] > 1 else 0.0
                    ),
                )
                db.add(coord_data)

        if col_coords is not None:
            for i, name in enumerate(df.columns):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=str(name),
                    point_type="column",
                    dimension_1=(
                        float(col_coords[i, 0]) if col_coords.shape[1] > 0 else 0.0
                    ),
                    dimension_2=(
                        float(col_coords[i, 1]) if col_coords.shape[1] > 1 else 0.0
                    ),
                )
                db.add(coord_data)

    def _save_eigenvalues_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """固有値データの保存"""
        try:
            eigenvalues = results.get("eigenvalues", [])
            explained_inertia = results.get(
                "explained_inertia", results.get("explained_variance_ratio", [])
            )
            cumulative_inertia = results.get(
                "cumulative_inertia", results.get("cumulative_variance_ratio", [])
            )

            for i, (eigenval, explained, cumulative) in enumerate(
                zip(eigenvalues, explained_inertia, cumulative_inertia)
            ):
                eigenvalue_data = EigenvalueData(
                    session_id=session_id,
                    dimension_number=i + 1,
                    eigenvalue=float(eigenval),
                    explained_inertia=float(explained),
                    cumulative_inertia=float(cumulative),
                )
                db.add(eigenvalue_data)
        except Exception as e:
            print(f"固有値データ保存エラー: {e}")

    def _save_visualization_data(self, db: Session, session_id: int, plot_base64: str):
        """可視化データの保存"""
        try:
            if plot_base64:
                viz_data = {
                    "session_id": session_id,
                    "image_base64": plot_base64,
                    "width": 1400,
                    "height": 1100,
                }

                # オプションフィールドを安全に追加
                try:
                    if hasattr(VisualizationData, "__table__"):
                        columns = [
                            col.name for col in VisualizationData.__table__.columns
                        ]
                        if "image_data" in columns:
                            viz_data["image_data"] = b""
                        if "image_size" in columns:
                            viz_data["image_size"] = len(plot_base64)
                        if "dpi" in columns:
                            viz_data["dpi"] = 300
                        if "image_type" in columns:
                            viz_data["image_type"] = f"{self.get_analysis_type()}_plot"
                        if "created_at" in columns:
                            viz_data["created_at"] = datetime.utcnow()
                except Exception as field_error:
                    print(f"フィールド確認エラー: {field_error}")

                visualization_data = VisualizationData(**viz_data)
                db.add(visualization_data)
                print(f"可視化データ保存完了: {len(plot_base64)}文字")
        except Exception as e:
            print(f"可視化データ保存エラー: {e}")

    def run_full_analysis(
        self,
        df: pd.DataFrame,
        db: Session,
        session_name: str,
        description: Optional[str],
        tags: List[str],
        user_id: str,
        file,
        csv_text: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """完全な分析パイプラインを実行"""
        try:
            # データ検証
            self.validate_data(df)

            # 分析実行
            results = self.analyze(df, **kwargs)

            # プロット作成
            plot_base64 = self.create_plot(results, df)

            # データベース保存
            session_id = self.save_to_database(
                db=db,
                session_name=session_name,
                description=description,
                tags=tags,
                user_id=user_id,
                file=file,
                csv_text=csv_text,
                df=df,
                results=results,
                plot_base64=plot_base64,
            )

            # レスポンス作成
            return self.create_response(
                results, df, session_id, session_name, file, plot_base64
            )

        except Exception as e:
            print(f"分析パイプラインエラー: {str(e)}")
            raise

    @abstractmethod
    def create_response(
        self,
        results: Dict[str, Any],
        df: pd.DataFrame,
        session_id: int,
        session_name: str,
        file,
        plot_base64: str,
    ) -> Dict[str, Any]:
        """レスポンスデータを作成"""
        pass


# python-api/analysis/base.py の _save_coordinates_data メソッドを更新


def _save_coordinates_data(
    self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
):
    """座標データの保存（各分析手法で個別実装可能）"""
    try:
        analysis_type = self.get_analysis_type()

        if analysis_type == "correspondence":
            # コレスポンデンス分析の座標保存
            self._save_correspondence_coordinates(db, session_id, df, results)
        elif analysis_type == "pca":
            # PCA分析の座標保存
            self._save_pca_coordinates(db, session_id, df, results)
        elif analysis_type == "factor":
            # 因子分析の座標保存
            self._save_factor_coordinates(db, session_id, df, results)
        elif analysis_type == "cluster":
            # クラスター解析の座標保存
            self._save_cluster_coordinates(db, session_id, df, results)
        else:
            # デフォルト（旧来の方式）
            self._save_default_coordinates(db, session_id, df, results)

    except Exception as e:
        print(f"座標データ保存エラー: {e}")


def _save_cluster_coordinates(
    self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
):
    """クラスター解析の座標データ保存"""
    try:
        from models import CoordinatesData

        pca_coordinates = results.get("pca_coordinates")
        labels = results.get("labels")
        sample_names = results.get("sample_names", df.index.tolist())

        if pca_coordinates is not None and labels is not None:
            for i, name in enumerate(sample_names):
                # クラスターラベルを含む観測値として保存
                cluster_label = labels[i] if labels[i] != -1 else "ノイズ"
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=f"{name}",
                    point_type="observation",
                    dimension_1=(
                        float(pca_coordinates[i, 0])
                        if pca_coordinates.shape[1] > 0
                        else 0.0
                    ),
                    dimension_2=(
                        float(pca_coordinates[i, 1])
                        if pca_coordinates.shape[1] > 1
                        else 0.0
                    ),
                )
                db.add(coord_data)

        # クラスター中心点の保存（K-meansの場合）
        if (
            results.get("method") == "kmeans"
            and results.get("cluster_centers") is not None
        ):
            cluster_centers = results.get("cluster_centers")
            for i, center in enumerate(cluster_centers):
                coord_data = CoordinatesData(
                    session_id=session_id,
                    point_name=f"クラスター{i+1}中心",
                    point_type="center",
                    dimension_1=float(center[0]) if len(center) > 0 else 0.0,
                    dimension_2=float(center[1]) if len(center) > 1 else 0.0,
                )
                db.add(coord_data)

    except Exception as e:
        print(f"クラスター座標データ保存エラー: {e}")


def save_to_database(
    self,
    db: Session,
    session_name: str,
    description: Optional[str],
    tags: List[str],
    user_id: str,
    file,
    csv_text: str,
    df: pd.DataFrame,
    results: Dict[str, Any],
    plot_base64: str,
) -> int:
    """データベースに保存（共通処理）- クラスター解析対応版"""
    try:
        print("=== データベース保存開始 ===")

        # 分析タイプに応じたchi2_valueとdegrees_of_freedomの設定
        analysis_type = self.get_analysis_type()

        if analysis_type == "pca":
            # PCAの場合: KMO値をchi2_valueに、主成分数をdegrees_of_freedomに保存
            chi2_value = results.get("kmo", 0.0)
            degrees_of_freedom = results.get("n_components", 0)
        elif analysis_type == "factor":
            # 因子分析の場合の設定
            chi2_value = results.get("chi2", 0.0)
            degrees_of_freedom = results.get("n_factors", 0)
        elif analysis_type == "cluster":
            # クラスター解析の場合の設定
            evaluation_metrics = results.get("evaluation_metrics", {})
            chi2_value = evaluation_metrics.get(
                "silhouette_score", 0.0
            )  # シルエット係数をchi2_valueに保存
            degrees_of_freedom = results.get(
                "n_clusters", 0
            )  # クラスター数をdegrees_of_freedomに保存
        else:
            # コレスポンデンス分析の場合（デフォルト）
            chi2_value = results.get("chi2", 0.0)
            degrees_of_freedom = results.get("degrees_of_freedom", 0)

        # セッション作成
        session = AnalysisSession(
            session_name=session_name,
            description=description or "",
            tags=tags,
            user_id=user_id,
            original_filename=file.filename,
            analysis_timestamp=datetime.utcnow(),
            analysis_type=analysis_type,
            row_count=df.shape[0],
            column_count=df.shape[1],
            total_inertia=results.get("total_inertia", 0.0),
            chi2_value=chi2_value,
            degrees_of_freedom=degrees_of_freedom,
        )

        db.add(session)
        db.flush()
        session_id = session.id

        print(f"セッション作成完了: ID={session_id}, Type={analysis_type}")

        # 各種データの保存
        self._save_original_data(db, session_id, csv_text, df)
        self._save_coordinates_data(db, session_id, df, results)
        self._save_eigenvalues_data(db, session_id, results)
        self._save_visualization_data(db, session_id, plot_base64)

        # クラスター解析特有のメタデータ保存
        if analysis_type == "cluster":
            self._save_cluster_metadata(db, session_id, results)

        db.commit()
        print(f"データベース保存完了: session_id={session_id}")
        return session_id

    except Exception as e:
        print(f"データベース保存で致命的エラー: {str(e)}")
        db.rollback()
        return 0


def _save_cluster_metadata(self, db: Session, session_id: int, results: Dict[str, Any]):
    """クラスター解析特有のメタデータ保存"""
    try:
        from models import AnalysisMetadata, MetadataTypes

        # 評価指標の保存
        evaluation_metrics = results.get("evaluation_metrics", {})
        if evaluation_metrics:
            metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type=MetadataTypes.CLUSTER_METRICS,
                metadata_content={
                    "evaluation_metrics": evaluation_metrics,
                    "method": results.get("method"),
                    "n_clusters": results.get("n_clusters"),
                    "cluster_sizes": results.get("cluster_sizes", []),
                },
            )
            db.add(metadata)

        # クラスター中心点の保存（K-meansの場合）
        if (
            results.get("method") == "kmeans"
            and results.get("cluster_centers") is not None
        ):
            metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type=MetadataTypes.CLUSTER_CENTERS,
                metadata_content={
                    "cluster_centers": results.get("cluster_centers"),
                    "feature_names": results.get("feature_names", []),
                },
            )
            db.add(metadata)

        # クラスター所属の保存
        if results.get("labels") is not None:
            metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type=MetadataTypes.CLUSTER_ASSIGNMENTS,
                metadata_content={
                    "labels": results.get("labels"),
                    "sample_names": results.get("sample_names", []),
                },
            )
            db.add(metadata)

    except Exception as e:
        print(f"クラスターメタデータ保存エラー: {e}")
