# python-api/analysis/base.py
from abc import ABC, abstractmethod
from typing import Dict, Any
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import io
import base64
from datetime import datetime
from sqlalchemy.orm import Session


class BaseAnalyzer(ABC):
    """分析基底クラス"""

    @abstractmethod
    def get_analysis_type(self) -> str:
        """分析タイプを返す（各サブクラスでオーバーライド）"""
        pass

    @abstractmethod
    def analyze(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """分析を実行（各サブクラスで実装）"""
        pass

    @abstractmethod
    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """プロットを作成（各サブクラスで実装）"""
        pass

    def setup_japanese_font(self):
        """日本語フォントの設定"""
        try:
            # 利用可能なフォントを検索
            font_paths = [
                "/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf",
                "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
                "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf",
                "/usr/share/fonts/truetype/takao-gothic/TakaoPGothic.ttf",
            ]

            font_prop = None
            for font_path in font_paths:
                try:
                    font_prop = fm.FontProperties(fname=font_path)
                    plt.rcParams["font.family"] = font_prop.get_name()
                    print(f"Japanese font set to: {font_prop.get_name()}")
                    break
                except:
                    continue

            if not font_prop:
                print("Warning: Japanese font not found, using default font")
                plt.rcParams["font.family"] = ["DejaVu Sans", "sans-serif"]

            # フォント設定
            plt.rcParams["axes.unicode_minus"] = False
            print("Japanese font setup completed")

        except Exception as e:
            print(f"Font setup error: {e}")
            plt.rcParams["font.family"] = ["DejaVu Sans", "sans-serif"]

    def save_plot_as_base64(self, fig) -> str:
        """プロットをBase64エンコードして返す"""
        buffer = io.BytesIO()
        fig.savefig(
            buffer, format="png", dpi=300, bbox_inches="tight", facecolor="white"
        )
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.read()).decode("utf-8")
        buffer.close()
        plt.close(fig)
        return image_base64

    def _save_to_database(
        self,
        db: Session,
        df: pd.DataFrame,
        results: Dict[str, Any],
        session_name: str,
        description: str,
        tags: list,
        user_id: str,
        file,
        csv_text: str,
        plot_base64: str,
    ) -> int:
        """データベースに分析結果を保存"""
        try:
            from models import AnalysisSession, AnalysisData, SessionTag

            # セッションの作成
            session = AnalysisSession(
                session_name=session_name,
                description=description,
                analysis_type=self.get_analysis_type(),
                user_id=user_id,
                filename=file.filename,
                original_csv=csv_text,
                row_count=df.shape[0],
                column_count=df.shape[1],
            )
            db.add(session)
            db.flush()

            session_id = session.session_id
            print(
                f"セッション作成完了: ID={session_id}, Type={self.get_analysis_type()}"
            )

            # タグの追加
            for tag_name in tags:
                if tag_name.strip():
                    tag = SessionTag(session_id=session_id, tag_name=tag_name.strip())
                    db.add(tag)

            # 分析データの保存
            analysis_data = AnalysisData(
                session_id=session_id,
                analysis_type=self.get_analysis_type(),
                parameters=results,
                results=results,
            )
            db.add(analysis_data)

            # 座標データの保存（サブクラスでオーバーライド可能）
            self._save_coordinates_data(db, session_id, df, results)

            # 可視化データの保存
            self._save_visualization_data(db, session_id, plot_base64)

            db.commit()
            return session_id

        except Exception as e:
            db.rollback()
            print(f"データベース保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _save_coordinates_data(
        self, db: Session, session_id: int, df: pd.DataFrame, results: Dict[str, Any]
    ):
        """座標データを保存（サブクラスでオーバーライド可能）"""
        pass

    def _save_visualization_data(self, db: Session, session_id: int, plot_base64: str):
        """可視化データを保存"""
        try:
            from models import VisualizationData
            import base64

            # Base64をバイナリにデコード
            image_data = base64.b64decode(plot_base64)

            viz_data = VisualizationData(
                session_id=session_id,
                image_type="plot",  # 汎用的な"plot"を使用
                image_data=image_data,
                image_base64=plot_base64,
                image_size=len(plot_base64),
                width=1600,
                height=1200,
                dpi=300,
                created_at=datetime.utcnow(),
            )
            db.add(viz_data)
            db.flush()

            print(f"可視化データ保存完了: {len(plot_base64)}文字")

        except Exception as e:
            print(f"可視化データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def run_full_analysis(
        self,
        df: pd.DataFrame,
        db: Session,
        session_name: str,
        description: str,
        tags: list,
        user_id: str,
        file,
        csv_text: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """完全な分析パイプラインを実行"""
        try:
            print("=== データベース保存開始 ===")

            # 分析の実行
            results = self.analyze(df, **kwargs)

            # プロット作成
            plot_base64 = self.create_plot(results, df)

            # データベースへの保存
            session_id = self._save_to_database(
                db,
                df,
                results,
                session_name,
                description,
                tags,
                user_id,
                file,
                csv_text,
                plot_base64,
            )

            # レスポンス作成
            response = self.create_response(
                results, df, session_id, session_name, file, plot_base64
            )

            print("=== データベース保存完了 ===")
            return response

        except Exception as e:
            print(f"データベース保存で致命的エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")

            # エラーが発生してもレスポンスを返す（session_idなし）
            try:
                # 最低限の分析結果を返す
                if "results" in locals():
                    return {
                        "success": True,
                        "session_id": None,  # session_idは設定しない
                        "analysis_type": self.get_analysis_type(),
                        "data": results,
                        "metadata": {
                            "session_name": session_name,
                            "filename": file.filename,
                            "rows": df.shape[0],
                            "columns": df.shape[1],
                        },
                        "plot_image": (
                            plot_base64 if "plot_base64" in locals() else None
                        ),
                    }
            except:
                pass

            # データベースエラーをraiseしない（レスポンスは返す）
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
        """レスポンスデータを作成（各サブクラスで実装）"""
        pass
