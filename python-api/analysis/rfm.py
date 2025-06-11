# analysis/rfm.py の完全実装版

from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import matplotlib

matplotlib.use("Agg")  # GUI無効化
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .base import BaseAnalyzer
from models import AnalysisSession, AnalysisMetadata, CoordinatesData


class RFMAnalysisAnalyzer(BaseAnalyzer):
    """RFM分析クラス（完全実装版）"""

    def get_analysis_type(self) -> str:
        return "rfm"

    def analyze(
        self,
        df: pd.DataFrame,
        customer_id_col: str = "id",
        date_col: str = "date",
        amount_col: str = "price",
        analysis_date: Optional[str] = None,
        rfm_divisions: int = 3,
        use_monetary_4_divisions: bool = False,
        **kwargs,
    ) -> Dict[str, Any]:
        """RFM分析を実行"""
        try:
            print(f"=== RFM分析開始 ===")
            print(f"データ形状: {df.shape}")
            print(
                f"顧客ID列: {customer_id_col}, 日付列: {date_col}, 金額列: {amount_col}"
            )

            # データの検証と前処理
            df_processed = self._preprocess_rfm_data(
                df, customer_id_col, date_col, amount_col, analysis_date
            )
            print(f"前処理後データ:\n{df_processed.head()}")

            # RFM分析の計算
            results = self._compute_rfm_analysis(
                df_processed, rfm_divisions, use_monetary_4_divisions, analysis_date
            )

            print(f"分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"RFM分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    async def get_session_detail(self, session_id: int, db: Session) -> dict:
        """RFM分析セッションの詳細情報を取得"""
        try:
            print(f"🔍 セッション {session_id} の詳細データを取得中...")

            # セッション情報の取得
            session = (
                db.query(AnalysisSession)
                .filter(AnalysisSession.id == session_id)
                .first()
            )

            if not session:
                return {
                    "success": False,
                    "error": f"セッション {session_id} が見つかりません",
                }

            if session.analysis_type != "rfm":
                return {
                    "success": False,
                    "error": f"セッション {session_id} はRFM分析ではありません（type: {session.analysis_type}）",
                }

            # メタデータの取得
            metadata = (
                db.query(AnalysisMetadata)
                .filter(
                    AnalysisMetadata.session_id == session_id,
                )
                .all()
            )

            # メタデータの解析
            stats_data = None
            coefficients_data = None
            for meta in metadata:
                if meta.metadata_type == "rfm_statistics":
                    stats_data = meta.metadata_content
                elif meta.metadata_type == "rfm_coefficients":
                    coefficients_data = meta.metadata_content

            # セッション詳細の構築
            session_detail = {
                "success": True,
                "session_id": session.id,
                "session_name": session.session_name,
                "analysis_type": "rfm",
                "filename": session.original_filename,
                "description": session.description,
                "analysis_date": session.analysis_timestamp.isoformat(),
                "row_count": session.row_count,
                "column_count": session.column_count,
                "total_customers": (
                    stats_data.get("total_customers") if stats_data else 0
                ),
                "rfm_divisions": stats_data.get("rfm_divisions") if stats_data else 3,
                "customer_data": (
                    stats_data.get("customer_data", []) if stats_data else []
                ),
                "segment_counts": (
                    stats_data.get("segment_counts", {}) if stats_data else {}
                ),
                "rfm_statistics": {
                    "rfm_stats": stats_data.get("rfm_stats", {}) if stats_data else {},
                    "segment_stats": (
                        stats_data.get("segment_stats", {}) if stats_data else {}
                    ),
                    "segment_definitions": (
                        stats_data.get("segment_definitions", {}) if stats_data else {}
                    ),
                },
                "plot_image": stats_data.get("plot_image", "") if stats_data else "",
                "download_urls": {
                    "customers": f"/api/rfm/download/{session_id}/customers",
                    "segments": f"/api/rfm/download/{session_id}/segments",
                    "details": f"/api/rfm/download/{session_id}/details",
                },
            }

            print(f"✅ セッション {session_id} の詳細データを取得完了")
            return session_detail

        except Exception as e:
            print(f"❌ セッション詳細取得エラー: {str(e)}")
            return {
                "success": False,
                "error": f"セッション詳細取得中にエラーが発生しました: {str(e)}",
            }

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """RFM分析の可視化を作成"""
        try:
            print("=== プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            # データ準備
            rfm_data = results["rfm_data"]
            segment_counts = results["segment_counts"]

            # 図のサイズと配置
            fig = plt.figure(figsize=(16, 12))
            fig.patch.set_facecolor("white")

            # 1. セグメント分布
            ax1 = plt.subplot(2, 3, 1)
            segment_counts_series = pd.Series(segment_counts)
            bars = plt.bar(
                range(len(segment_counts_series)),
                segment_counts_series.values,
                color="skyblue",
            )
            plt.title("セグメント別顧客数分布", fontsize=12)
            plt.ylabel("顧客数")
            plt.xticks(
                range(len(segment_counts_series)),
                segment_counts_series.index,
                rotation=45,
                ha="right",
            )

            # バーの上に数値表示
            for i, v in enumerate(segment_counts_series.values):
                plt.text(i, v + 0.5, str(v), ha="center")

            # 2. Recency分布
            ax2 = plt.subplot(2, 3, 2)
            plt.hist(rfm_data["recency"], bins=20, alpha=0.7, color="coral")
            plt.title("Recency分布")
            plt.xlabel("最終購入からの日数")
            plt.ylabel("顧客数")

            # 3. Frequency分布
            ax3 = plt.subplot(2, 3, 3)
            plt.hist(rfm_data["frequency"], bins=20, alpha=0.7, color="purple")
            plt.title("Frequency分布")
            plt.xlabel("購入回数")
            plt.ylabel("顧客数")

            # 4. Monetary分布
            ax4 = plt.subplot(2, 3, 4)
            plt.hist(rfm_data["monetary"], bins=20, alpha=0.7, color="green")
            plt.title("Monetary分布")
            plt.xlabel("購入金額合計")
            plt.ylabel("顧客数")

            # 5. RFMスコア分布
            ax5 = plt.subplot(2, 3, 5)
            rfm_score_counts = rfm_data["rfm_score"].value_counts().sort_index()
            bars = plt.bar(
                rfm_score_counts.index, rfm_score_counts.values, alpha=0.7, color="blue"
            )
            plt.title("RFMスコア分布")
            plt.xlabel("RFMスコア")
            plt.ylabel("顧客数")

            # 6. セグメント別平均値
            ax6 = plt.subplot(2, 3, 6)
            segment_avg = rfm_data.groupby("segment").agg(
                {"recency": "mean", "frequency": "mean", "monetary": "mean"}
            )

            # 正規化して表示
            segment_avg_norm = segment_avg.copy()
            segment_avg_norm["recency"] = -segment_avg_norm[
                "recency"
            ]  # Recencyは小さいほど良い
            for col in segment_avg_norm.columns:
                if segment_avg_norm[col].max() != segment_avg_norm[col].min():
                    segment_avg_norm[col] = (
                        segment_avg_norm[col] - segment_avg_norm[col].min()
                    ) / (segment_avg_norm[col].max() - segment_avg_norm[col].min())

            sns.heatmap(segment_avg_norm, annot=True, cmap="YlGnBu", fmt=".2f")
            plt.title("セグメント別RFM特性")

            # 全体のタイトル
            fig.suptitle(
                f"RFM分析結果\n"
                f"総顧客数: {results['total_customers']}人, "
                f"分析期間: {results['date_range']['start']} - {results['date_range']['end']}, "
                f"分析基準日: {results['analysis_date']}",
                fontsize=14,
                y=0.98,
            )

            plt.tight_layout()
            plt.subplots_adjust(top=0.92)

            # Base64エンコード
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

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
        try:
            results["plot_base64"] = plot_base64

            return {
                "success": True,
                "session_id": session_id,
                "analysis_type": self.get_analysis_type(),
                "plot_base64": plot_base64,
                "data": {
                    "total_customers": results["total_customers"],
                    "analysis_date": results["analysis_date"],
                    "date_range": results["date_range"],
                    "rfm_divisions": results["rfm_divisions"],
                    # 顧客RFMデータ
                    "customer_data": results["customer_rfm_data"],
                    # 統計情報
                    "rfm_stats": results["rfm_stats"],
                    "segment_stats": results["segment_stats"],
                    "segment_counts": results["segment_counts"],
                    # セグメント定義
                    "segment_definitions": results["segment_definitions"],
                    # プロット画像
                    "plot_base64": plot_base64,  # ✅ data内にも追加
                },
                "metadata": {
                    "session_name": session_name,
                    "filename": file.filename,
                    "rows": df.shape[0],
                    "columns": df.shape[1],
                    "analysis_period_days": results["analysis_period_days"],
                },
            }

        except Exception as e:
            print(f"❌ レスポンス作成エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _preprocess_rfm_data(
        self,
        df: pd.DataFrame,
        customer_id_col: str,
        date_col: str,
        amount_col: str,
        analysis_date: Optional[str],
    ) -> pd.DataFrame:
        """RFM分析用のデータ前処理"""

        # 必要な列の存在確認
        required_cols = [customer_id_col, date_col, amount_col]
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"必要な列が見つかりません: {missing_cols}")

        # データのコピーを作成
        df_clean = df.copy()

        # 日付列を日付型に変換
        try:
            df_clean[date_col] = pd.to_datetime(df_clean[date_col])
        except Exception as e:
            raise ValueError(f"日付列の変換に失敗しました: {e}")

        # 金額列を数値型に変換
        try:
            df_clean[amount_col] = pd.to_numeric(df_clean[amount_col])
        except Exception as e:
            raise ValueError(f"金額列の変換に失敗しました: {e}")

        # 欠損値の除去
        df_clean = df_clean.dropna(subset=required_cols)

        # 負の金額を除去
        df_clean = df_clean[df_clean[amount_col] > 0]

        if df_clean.empty:
            raise ValueError("前処理後にデータが空になりました")

        # 標準列名にリネーム
        df_clean = df_clean.rename(
            columns={customer_id_col: "id", date_col: "date", amount_col: "price"}
        )

        print(f"前処理完了: {df.shape} -> {df_clean.shape}")
        return df_clean

    def _compute_rfm_analysis(
        self,
        df: pd.DataFrame,
        rfm_divisions: int,
        use_monetary_4_divisions: bool,
        analysis_date: Optional[str],
    ) -> Dict[str, Any]:
        """RFM分析の計算"""
        try:
            # 分析基準日の設定
            if analysis_date:
                analysis_date_dt = pd.to_datetime(analysis_date)
            else:
                analysis_date_dt = df["date"].max() + pd.Timedelta(days=1)

            print(f"分析基準日: {analysis_date_dt}")

            # 顧客ごとのRFM値を計算
            rfm = df.groupby("id").agg(
                {
                    "date": lambda x: (analysis_date_dt - x.max()).days,  # Recency
                    "id": "count",  # Frequency
                    "price": "sum",  # Monetary
                }
            )

            rfm.columns = ["recency", "frequency", "monetary"]

            # RFMスコアの計算
            # Recencyは値が小さいほど良いので逆転
            rfm["R"] = pd.qcut(
                rfm["recency"].rank(method="first"),
                q=rfm_divisions,
                labels=list(range(rfm_divisions, 0, -1)),
            )
            rfm["F"] = pd.qcut(
                rfm["frequency"].rank(method="first"),
                q=rfm_divisions,
                labels=list(range(1, rfm_divisions + 1)),
            )
            rfm["M"] = pd.qcut(
                rfm["monetary"].rank(method="first"),
                q=rfm_divisions,
                labels=list(range(1, rfm_divisions + 1)),
            )

            # RFMスコアの合計
            rfm["rfm_score"] = (
                rfm["R"].astype(int) + rfm["F"].astype(int) + rfm["M"].astype(int)
            )

            # セグメント分類
            rfm["segment"] = rfm.apply(
                lambda x: self._get_segment(x["R"], x["F"], x["M"], rfm_divisions),
                axis=1,
            )

            # 統計情報の計算
            rfm_stats = {
                "recency": {
                    "mean": float(rfm["recency"].mean()),
                    "std": float(rfm["recency"].std()),
                    "min": float(rfm["recency"].min()),
                    "max": float(rfm["recency"].max()),
                },
                "frequency": {
                    "mean": float(rfm["frequency"].mean()),
                    "std": float(rfm["frequency"].std()),
                    "min": float(rfm["frequency"].min()),
                    "max": float(rfm["frequency"].max()),
                },
                "monetary": {
                    "mean": float(rfm["monetary"].mean()),
                    "std": float(rfm["monetary"].std()),
                    "min": float(rfm["monetary"].min()),
                    "max": float(rfm["monetary"].max()),
                },
            }

            # セグメント別統計
            segment_stats_raw = (
                rfm.groupby("segment")
                .agg(
                    {
                        "recency": ["mean", "count"],
                        "frequency": "mean",
                        "monetary": "mean",
                        "rfm_score": "mean",
                    }
                )
                .round(2)
            )

            # マルチレベルカラムをフラット化
            segment_stats = {}
            for segment in segment_stats_raw.index:
                segment_stats[str(segment)] = {
                    "recency_mean": float(
                        segment_stats_raw.loc[segment, ("recency", "mean")]
                    ),
                    "customer_count": int(
                        segment_stats_raw.loc[segment, ("recency", "count")]
                    ),
                    "frequency_mean": float(
                        segment_stats_raw.loc[segment, "frequency"]
                    ),
                    "monetary_mean": float(segment_stats_raw.loc[segment, "monetary"]),
                    "rfm_score_mean": float(
                        segment_stats_raw.loc[segment, "rfm_score"]
                    ),
                }

            # 顧客データの準備
            customer_rfm_data = []
            for customer_id, row in rfm.iterrows():
                customer_rfm_data.append(
                    {
                        "customer_id": str(customer_id),
                        "recency": float(row["recency"]),
                        "frequency": float(row["frequency"]),
                        "monetary": float(row["monetary"]),
                        "r_score": int(row["R"]),
                        "f_score": int(row["F"]),
                        "m_score": int(row["M"]),
                        "rfm_score": float(row["rfm_score"]),
                        "segment": str(row["segment"]),
                    }
                )

            # セグメント数の集計
            segment_counts_series = rfm["segment"].value_counts()
            segment_counts = {str(k): int(v) for k, v in segment_counts_series.items()}

            return {
                "rfm_data": rfm,
                "customer_rfm_data": customer_rfm_data,
                "rfm_stats": rfm_stats,
                "segment_stats": segment_stats,
                "segment_counts": segment_counts,
                "analysis_date": analysis_date_dt.strftime("%Y-%m-%d"),
                "total_customers": int(len(rfm)),
                "rfm_divisions": int(rfm_divisions),
                "date_range": {
                    "start": df["date"].min().strftime("%Y-%m-%d"),
                    "end": df["date"].max().strftime("%Y-%m-%d"),
                },
                "analysis_period_days": int((analysis_date_dt - df["date"].min()).days),
                "segment_definitions": self._get_segment_definitions(),
            }

        except Exception as e:
            print(f"RFM分析計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def _get_segment(self, r: int, f: int, m: int, divisions: int) -> str:
        """RFMスコアからセグメントを決定"""
        if divisions == 3:
            if r == 3:
                if f == 3 and m == 3:
                    return "VIP顧客"
                elif f >= 2 and m >= 2:
                    return "優良顧客"
                else:
                    return "新規顧客"
            elif r == 2:
                if f == 3 and m == 3:
                    return "要注意ヘビーユーザー"
                elif f >= 2 and m >= 2:
                    return "安定顧客"
                else:
                    return "見込み顧客"
            else:  # r == 1
                if f == 3 and m == 3:
                    return "離脱した優良顧客"
                elif f >= 2 and m >= 2:
                    return "離脱しつつある顧客"
                else:
                    return "離脱顧客"
        else:
            # より細かい分割の場合の簡易ロジック
            score_sum = r + f + m
            max_score = divisions * 3
            if score_sum >= max_score * 0.8:
                return "優良顧客"
            elif score_sum >= max_score * 0.6:
                return "安定顧客"
            elif score_sum >= max_score * 0.4:
                return "見込み顧客"
            else:
                return "要改善顧客"

    def _get_segment_definitions(self) -> Dict[str, str]:
        """セグメント定義を返す"""
        return {
            "VIP顧客": "最近購入し、頻繁に購入し、高額な顧客",
            "優良顧客": "最近購入し、適度に購入し、ある程度の金額を使う顧客",
            "新規顧客": "最近購入したが、まだ頻度や金額が少ない顧客",
            "要注意ヘビーユーザー": "購入頻度・金額は高いが、最近購入していない顧客",
            "安定顧客": "定期的に購入している顧客",
            "見込み顧客": "ポテンシャルがある顧客",
            "離脱した優良顧客": "過去は優良だったが、最近購入していない顧客",
            "離脱しつつある顧客": "購入が減っている顧客",
            "離脱顧客": "購入しなくなった顧客",
        }

    # データベース保存処理（既存の修正版を使用）
    def _save_customer_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """顧客RFMデータを座標データとして保存"""
        try:
            from models import CoordinatesData
            from sqlalchemy import text
            import json

            print(f"=== RFM顧客データ保存開始 ===")
            print(f"セッションID: {session_id}")

            customer_data = results.get("customer_rfm_data", [])
            if not customer_data:
                print("❌ customer_rfm_dataが空です")
                return

            print(f"保存対象データ: {len(customer_data)}件")

            success_count = 0

            for i, customer in enumerate(customer_data):
                try:
                    metadata_json = {
                        "segment": str(customer["segment"]),
                        "r_score": int(customer["r_score"]),
                        "f_score": int(customer["f_score"]),
                        "m_score": int(customer["m_score"]),
                    }

                    insert_sql = text(
                        """
                        INSERT INTO coordinates_data 
                        (session_id, point_type, point_name, dimension_1, dimension_2, dimension_3, dimension_4, metadata_json)
                        VALUES (:session_id, :point_type, :point_name, :dimension_1, :dimension_2, :dimension_3, :dimension_4, :metadata_json)
                    """
                    )

                    params = {
                        "session_id": int(session_id),
                        "point_type": "customer",
                        "point_name": str(customer["customer_id"]),
                        "dimension_1": round(float(customer["recency"]), 2),
                        "dimension_2": round(float(customer["frequency"]), 2),
                        "dimension_3": round(float(customer["monetary"]), 2),
                        "dimension_4": round(float(customer["rfm_score"]), 2),
                        "metadata_json": json.dumps(metadata_json, ensure_ascii=False),
                    }

                    db.execute(insert_sql, params)
                    success_count += 1

                except Exception as e:
                    print(f"❌ 顧客 {customer['customer_id']} 保存エラー: {str(e)}")
                    continue

            db.commit()
            print(f"✅ {success_count}件のデータが保存されました")

        except Exception as e:
            print(f"❌ RFM顧客データ保存エラー: {e}")
            db.rollback()
            raise

    # プロット保存時のimage_typeを修正
    def save_plot_as_base64(self, fig):
        """プロットをBase64文字列として保存"""
        import base64
        import io

        # PNG形式で保存
        buffer = io.BytesIO()
        fig.savefig(buffer, format="png", dpi=300, bbox_inches="tight")
        buffer.seek(0)

        # Base64エンコード
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        plt.close(fig)

        return image_base64

    # データベース保存時の修正（基底クラスまたはRFMクラス）
    def save_to_database(
        self,
        db,
        session_name,
        description,
        tags,
        user_id,
        file,
        csv_text,
        df,
        results,
        plot_base64,
    ):
        """データベース保存（image_type修正版）"""
        try:
            from models import AnalysisSession, VisualizationData, SessionTag

            # セッション保存
            session = AnalysisSession(
                session_name=session_name,
                original_filename=file.filename,
                analysis_type=self.get_analysis_type(),
                description=description,
                user_id=user_id,
                row_count=df.shape[0],
                column_count=df.shape[1],
            )

            db.add(session)
            db.flush()
            session_id = session.id

            print(
                f"セッション作成完了: ID={session_id}, Type={self.get_analysis_type()}"
            )

            # タグ保存
            if tags:
                for tag in tags:
                    if tag.strip():
                        session_tag = SessionTag(
                            session_id=session_id, tag_name=tag.strip()
                        )
                        db.add(session_tag)

            # 可視化データ保存（image_typeを修正）
            if plot_base64:
                visualization = VisualizationData(
                    session_id=session_id,
                    image_type="correspondence_plot",  # デフォルト値を使用
                    image_base64=plot_base64,
                    image_size=len(plot_base64),
                    width=1400,
                    height=1100,
                    dpi=300,
                )
                db.add(visualization)
                print(f"可視化データ保存完了: {len(plot_base64)}文字")

            # RFM特有のデータ保存
            if self.get_analysis_type() == "rfm":
                self._save_customer_data(db, session_id, results)
                self._save_rfm_metadata(db, session_id, results)

            db.commit()
            print(f"✅ データベース保存完了: セッションID={session_id}")

            return session_id

        except Exception as e:
            print(f"データベース保存で致命的エラー: {e}")
            db.rollback()
            return 0  # エラー時は0を返す

    def _save_rfm_metadata(self, db, session_id, results):
        """RFM分析のメタデータを保存"""
        try:
            from models import AnalysisMetadata

            # RFM統計情報
            rfm_metadata = {
                "rfm_stats": results.get("rfm_stats", {}),
                "segment_counts": results.get("segment_counts", {}),
                "segment_stats": results.get("segment_stats", {}),  # ✅ 追加
                "segment_definitions": results.get(
                    "segment_definitions", {}
                ),  # ✅ 追加
                "customer_data": results.get("customer_rfm_data", []),  # ✅ 追加
                "analysis_date": results.get("analysis_date", ""),
                "total_customers": results.get("total_customers", 0),
                "rfm_divisions": results.get("rfm_divisions", 3),  # ✅ 追加
                "plot_base64": results.get("plot_base64", ""),  # ✅ プロット画像を追加
            }

            metadata = AnalysisMetadata(
                session_id=session_id,
                metadata_type="rfm_statistics",
                metadata_content=rfm_metadata,
            )
            db.add(metadata)

            print("RFMメタデータ保存完了")

        except Exception as e:
            print(f"RFMメタデータ保存エラー: {e}")
