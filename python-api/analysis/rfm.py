from typing import Dict, Any, Optional, List
import pandas as pd
import numpy as np
import matplotlib

matplotlib.use("Agg")  # GUI無効化

import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
import seaborn as sns
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .base import BaseAnalyzer


class RFMAnalysisAnalyzer(BaseAnalyzer):
    """RFM分析クラス"""

    def get_analysis_type(self) -> str:
        return "rfm"

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
        try:
            print("=== RFM分析データベース保存開始 ===")

            # 基底クラスのメソッド呼び出し
            if hasattr(super(), "save_to_database"):
                session_id = super().save_to_database(
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
                )
            else:
                # 基底クラスにメソッドがない場合の代替実装
                print("⚠️ 基底クラスにsave_to_databaseメソッドがありません")
                session_id = self._save_session_directly(
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
                )

            # RFM分析特有のデータを追加保存
            self._save_rfm_specific_data(db, session_id, results)

            # 顧客データを保存
            self._save_customer_data(db, session_id, results)

            return session_id

        except Exception as e:
            print(f"❌ RFM分析データベース保存エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return 0

    def _save_rfm_specific_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """RFM分析特有のデータを保存"""
        try:
            from models import AnalysisMetadata

            # RFM統計情報をJSONシリアライズ可能な形式に変換
            if "rfm_stats" in results:
                # segment_countsを辞書から普通の辞書に変換
                segment_counts = results.get("segment_counts", {})
                if hasattr(segment_counts, "to_dict"):
                    segment_counts = segment_counts.to_dict()
                elif not isinstance(segment_counts, dict):
                    segment_counts = dict(segment_counts)

                # 全ての値を適切な型に変換
                rfm_metadata = {
                    "rfm_stats": results["rfm_stats"],
                    "segment_counts": {
                        str(k): int(v) for k, v in segment_counts.items()
                    },
                    "analysis_date": str(results.get("analysis_date", "")),
                    "total_customers": int(results.get("total_customers", 0)),
                    "date_range": {
                        "start": str(results.get("date_range", {}).get("start", "")),
                        "end": str(results.get("date_range", {}).get("end", "")),
                    },
                }

                metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="rfm_statistics",
                    metadata_content=rfm_metadata,
                )
                db.add(metadata)

            # セグメント定義
            if "segment_definitions" in results:
                segment_metadata = AnalysisMetadata(
                    session_id=session_id,
                    metadata_type="rfm_segments",
                    metadata_content=results["segment_definitions"],
                )
                db.add(segment_metadata)

            db.commit()

        except Exception as e:
            print(f"RFM分析特有データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")

    def _save_customer_data(
        self, db: Session, session_id: int, results: Dict[str, Any]
    ):
        """顧客RFMデータを座標データとして保存"""
        try:
            from models import CoordinatesData

            print(f"=== RFM顧客データ保存開始 ===")

            # 顧客RFMデータを保存
            customer_data = results.get("customer_rfm_data", [])
            if customer_data:
                print(f"顧客RFMデータ保存: {len(customer_data)}件")
                for customer in customer_data:
                    # メタデータをJSONシリアライズ可能な形式に変換
                    metadata_json = {
                        "segment": str(customer["segment"]),
                        "r_score": int(customer["r_score"]),
                        "f_score": int(customer["f_score"]),
                        "m_score": int(customer["m_score"]),
                    }

                    coord_data = CoordinatesData(
                        session_id=session_id,
                        point_name=str(customer["customer_id"]),
                        point_type="customer",
                        dimension_1=float(customer["recency"]),
                        dimension_2=float(customer["frequency"]),
                        dimension_3=float(customer["monetary"]),
                        dimension_4=float(customer["rfm_score"]),
                        # JSONシリアライズ可能な形式で保存
                        metadata_json=metadata_json,
                    )
                    db.add(coord_data)

            db.commit()
            print(f"✅ RFM顧客データ保存完了")

        except Exception as e:
            print(f"❌ RFM顧客データ保存エラー: {e}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            db.rollback()

    def _save_session_directly(
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
        """基底クラスのメソッドがない場合の直接保存"""
        try:
            from models import AnalysisSession, VisualizationData

            # セッション基本情報を保存
            session = AnalysisSession(
                session_name=session_name,
                description=description,
                analysis_type=self.get_analysis_type(),
                filename=file.filename,
                csv_content=csv_text,
                user_id=user_id,
                row_count=df.shape[0],
                column_count=df.shape[1],
                # RFM分析特有のメタデータ
                dimensions_count=3,  # R, F, M
                total_customers=results.get("total_customers", 0),
                analysis_period_days=results.get("analysis_period_days", 0),
            )

            db.add(session)
            db.flush()
            session_id = session.session_id

            # タグを保存
            if tags:
                from models import SessionTag

                for tag in tags:
                    if tag.strip():
                        session_tag = SessionTag(
                            session_id=session_id, tag_name=tag.strip()
                        )
                        db.add(session_tag)

            # プロット画像を保存
            if plot_base64:
                visualization = VisualizationData(
                    session_id=session_id,
                    plot_image=plot_base64,
                    plot_width=1600,
                    plot_height=1200,
                )
                db.add(visualization)

            db.commit()
            return session_id

        except Exception as e:
            print(f"❌ 直接保存エラー: {str(e)}")
            db.rollback()
            return 0

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
            print(f"入力データ:\n{df}")
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

            # 4分割のMonetary値も計算（オプション）
            if use_monetary_4_divisions:
                rfm["M_4"] = pd.qcut(
                    rfm["monetary"].rank(method="first"), q=4, labels=[1, 2, 3, 4]
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

            # セグメント別の統計
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

            # マルチレベルカラムをフラット化してJSONシリアライズ可能な形式に変換
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

            # セグメント数の集計（pandas Seriesを辞書に変換）
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

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """RFM分析の可視化を作成"""
        try:
            print("=== プロット作成開始 ===")

            # 日本語フォント設定
            self.setup_japanese_font()

            # データ準備
            rfm_data = results["rfm_data"]
            segment_counts = results["segment_counts"]
            rfm_stats = results["rfm_stats"]

            # 図のサイズと配置
            fig = plt.figure(figsize=(20, 16))
            fig.patch.set_facecolor("white")

            # 1. セグメント分布
            ax1 = plt.subplot(3, 4, 1)
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
            ax2 = plt.subplot(3, 4, 2)
            plt.hist(rfm_data["recency"], bins=30, alpha=0.7, color="coral")
            plt.title("Recency分布")
            plt.xlabel("最終購入からの日数")
            plt.ylabel("顧客数")

            # 3. Frequency分布
            ax3 = plt.subplot(3, 4, 3)
            plt.hist(rfm_data["frequency"], bins=30, alpha=0.7, color="purple")
            plt.title("Frequency分布")
            plt.xlabel("購入回数")
            plt.ylabel("顧客数")

            # 4. Monetary分布
            ax4 = plt.subplot(3, 4, 4)
            plt.hist(rfm_data["monetary"], bins=30, alpha=0.7, color="green")
            plt.title("Monetary分布")
            plt.xlabel("購入金額合計")
            plt.ylabel("顧客数")

            # 5. RFMスコア分布
            ax5 = plt.subplot(3, 4, 5)
            rfm_score_counts = rfm_data["rfm_score"].value_counts().sort_index()
            bars = plt.bar(
                rfm_score_counts.index, rfm_score_counts.values, alpha=0.7, color="blue"
            )
            plt.title("RFMスコア分布")
            plt.xlabel("RFMスコア")
            plt.ylabel("顧客数")

            # バーの上に数値表示
            for i, (idx, v) in enumerate(rfm_score_counts.items()):
                plt.text(idx, v + 0.5, str(v), ha="center")

            # 6. R vs F ヒートマップ
            ax6 = plt.subplot(3, 4, 6)
            heatmap_data = pd.crosstab(rfm_data["R"], rfm_data["F"])
            sns.heatmap(heatmap_data, annot=True, cmap="YlGnBu", fmt="d")
            plt.title("RecencyとFrequencyの関係")

            # 7. F vs M 散布図
            ax7 = plt.subplot(3, 4, 7)
            scatter = plt.scatter(
                rfm_data["frequency"],
                rfm_data["monetary"],
                alpha=0.5,
                c=rfm_data["recency"],
                cmap="viridis",
            )
            plt.colorbar(scatter, label="Recency (日)")
            plt.title("FrequencyとMonetaryの関係")
            plt.xlabel("Frequency")
            plt.ylabel("Monetary")

            # 8. セグメント別RFMスコア箱ひげ図
            ax8 = plt.subplot(3, 4, 8)
            sns.boxplot(x="segment", y="rfm_score", data=rfm_data)
            plt.title("セグメント別RFMスコア分布")
            plt.xticks(rotation=45, ha="right")

            # 9. セグメント別平均RFM値
            ax9 = plt.subplot(3, 4, 9)
            segment_avg = rfm_data.groupby("segment").agg(
                {"recency": "mean", "frequency": "mean", "monetary": "mean"}
            )

            # 正規化して表示
            segment_avg_norm = segment_avg.copy()
            segment_avg_norm["recency"] = -segment_avg_norm[
                "recency"
            ]  # Recencyは小さいほど良い
            for col in segment_avg_norm.columns:
                segment_avg_norm[col] = (
                    segment_avg_norm[col] - segment_avg_norm[col].min()
                ) / (segment_avg_norm[col].max() - segment_avg_norm[col].min())

            sns.heatmap(segment_avg_norm, annot=True, cmap="YlGnBu", fmt=".2f")
            plt.title("セグメント別RFM特性")

            # 10. 3D散布図
            ax10 = plt.subplot(3, 4, 10, projection="3d")
            segments = rfm_data["segment"].unique()
            colors = plt.cm.tab10(np.linspace(0, 1, len(segments)))

            for i, segment in enumerate(segments):
                segment_data = rfm_data[rfm_data["segment"] == segment]
                ax10.scatter(
                    segment_data["recency"],
                    segment_data["frequency"],
                    segment_data["monetary"],
                    c=[colors[i]],
                    label=segment,
                    alpha=0.6,
                )

            ax10.set_xlabel("Recency")
            ax10.set_ylabel("Frequency")
            ax10.set_zlabel("Monetary")
            ax10.set_title("RFM 3D散布図")

            # 11. 時系列パターン（月別トレンド）
            ax11 = plt.subplot(3, 4, 11)
            monthly_sales = df.groupby(df["date"].dt.to_period("M")).agg(
                {"price": "sum", "id": "nunique"}
            )
            monthly_sales.index = monthly_sales.index.to_timestamp()

            ax11_twin = ax11.twinx()
            ax11.plot(monthly_sales.index, monthly_sales["price"], "b-", label="売上")
            ax11_twin.plot(
                monthly_sales.index, monthly_sales["id"], "r-", label="顧客数"
            )
            ax11.set_title("月別売上・顧客数推移")
            ax11.set_ylabel("売上", color="b")
            ax11_twin.set_ylabel("顧客数", color="r")
            plt.xticks(rotation=45)

            # 12. セグメント推移（簡易版）
            ax12 = plt.subplot(3, 4, 12)
            segment_pie = plt.pie(
                segment_counts.values(),
                labels=segment_counts.keys(),
                autopct="%1.1f%%",
                startangle=90,
            )
            plt.title("セグメント構成比")

            # 全体のタイトル
            fig.suptitle(
                f"RFM分析結果\n"
                f"総顧客数: {results['total_customers']}人, "
                f"分析期間: {results['date_range']['start']} - {results['date_range']['end']}, "
                f"分析基準日: {results['analysis_date']}",
                fontsize=16,
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
            return {
                "success": True,
                "session_id": session_id,
                "analysis_type": self.get_analysis_type(),
                "data": {
                    "total_customers": results["total_customers"],
                    "analysis_date": results["analysis_date"],
                    "date_range": results["date_range"],
                    "rfm_divisions": results["rfm_divisions"],
                    # 顧客RFMデータ
                    "customer_data": results["customer_rfm_data"],
                    # 統計情報（JSONシリアライズ可能な形式）
                    "rfm_stats": results["rfm_stats"],
                    "segment_stats": results[
                        "segment_stats"
                    ],  # 既にJSONシリアライズ可能な形式に変換済み
                    "segment_counts": results["segment_counts"],
                    # セグメント定義
                    "segment_definitions": results["segment_definitions"],
                    # プロット画像
                    "plot_image": plot_base64,
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

    def get_session_detail(self, db: Session, session_id: int) -> Dict[str, Any]:
        """RFM分析セッション詳細を取得"""
        try:
            print(f"📊 RFM分析セッション詳細取得開始: {session_id}")

            # 基底クラスのメソッドが存在するかチェック
            if hasattr(super(), "get_session_detail"):
                try:
                    base_detail = super().get_session_detail(db, session_id)
                except Exception as e:
                    print(f"⚠️ 基底クラスのget_session_detailエラー: {e}")
                    base_detail = self._get_session_detail_directly(db, session_id)
            else:
                print("⚠️ 基底クラスにget_session_detailメソッドがありません")
                base_detail = self._get_session_detail_directly(db, session_id)

            if not base_detail or not base_detail.get("success"):
                return base_detail

            # RFM特有の顧客データを取得
            customer_data = self._get_customer_data(db, session_id)

            # レスポンス構造を構築
            response_data = {
                "success": True,
                "data": {
                    "session_info": base_detail["data"]["session_info"],
                    "metadata": {
                        "filename": base_detail["data"]["metadata"]["filename"],
                        "rows": base_detail["data"]["metadata"]["rows"],
                        "columns": base_detail["data"]["metadata"]["columns"],
                        "total_customers": len(customer_data.get("customers", [])),
                        "analysis_date": customer_data.get("analysis_date", ""),
                    },
                    "analysis_data": {
                        "customers": customer_data.get("customers", []),
                        "segment_counts": customer_data.get("segment_counts", {}),
                        "rfm_stats": customer_data.get("rfm_stats", {}),
                    },
                    "visualization": base_detail["data"].get("visualization", {}),
                },
            }

            print(f"✅ RFM分析セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ RFM分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    def _get_customer_data(self, db: Session, session_id: int) -> Dict[str, Any]:
        """顧客データを取得"""
        try:
            from models import CoordinatesData, AnalysisMetadata

            # 顧客座標データを取得
            coordinates = (
                db.query(CoordinatesData)
                .filter(
                    CoordinatesData.session_id == session_id,
                    CoordinatesData.point_type == "customer",
                )
                .all()
            )

            # 顧客データ
            customers = []
            for coord in coordinates:
                customer_data = {
                    "customer_id": coord.point_name,
                    "recency": coord.dimension_1 or 0.0,
                    "frequency": coord.dimension_2 or 0.0,
                    "monetary": coord.dimension_3 or 0.0,
                    "rfm_score": coord.dimension_4 or 0.0,
                }

                # メタデータからセグメント情報を取得
                if coord.metadata_json:
                    customer_data.update(coord.metadata_json)

                customers.append(customer_data)

            # RFM統計メタデータを取得
            rfm_metadata = (
                db.query(AnalysisMetadata)
                .filter(
                    AnalysisMetadata.session_id == session_id,
                    AnalysisMetadata.metadata_type == "rfm_statistics",
                )
                .first()
            )

            metadata_content = {}
            if rfm_metadata and rfm_metadata.metadata_content:
                metadata_content = rfm_metadata.metadata_content

            print(f"🔍 顧客データ取得結果: {len(customers)}件")

            return {
                "customers": customers,
                "segment_counts": metadata_content.get("segment_counts", {}),
                "rfm_stats": metadata_content.get("rfm_stats", {}),
                "analysis_date": metadata_content.get("analysis_date", ""),
                "total_customers": metadata_content.get(
                    "total_customers", len(customers)
                ),
            }

        except Exception as e:
            print(f"❌ 顧客データ取得エラー: {str(e)}")
            return {
                "customers": [],
                "segment_counts": {},
                "rfm_stats": {},
                "analysis_date": "",
                "total_customers": 0,
            }

    def _get_session_detail_directly(self, db: Session, session_id: int):
        """RFM分析セッション詳細を直接取得"""
        try:
            from models import AnalysisSession, VisualizationData, CoordinatesData

            print(f"📊 RFM分析セッション詳細取得開始: {session_id}")

            # セッション基本情報を取得
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

            print(f"✅ セッション基本情報取得: {session.session_name}")

            # 可視化データを取得
            visualization = (
                db.query(VisualizationData)
                .filter(VisualizationData.session_id == session_id)
                .first()
            )

            # 顧客データを取得
            customer_data = self._get_customer_data(db, session_id)

            # レスポンス構造を構築
            response_data = {
                "success": True,
                "data": {
                    "session_info": {
                        "session_id": session.id,
                        "session_name": session.session_name,
                        "description": getattr(session, "description", "") or "",
                        "filename": session.original_filename,
                        "row_count": getattr(session, "row_count", 0) or 0,
                        "column_count": getattr(session, "column_count", 0) or 0,
                        "total_customers": getattr(
                            session, "total_customers", customer_data["total_customers"]
                        )
                        or customer_data["total_customers"],
                        "analysis_period_days": getattr(
                            session, "analysis_period_days", 0
                        )
                        or 0,
                        "analysis_timestamp": (
                            session.analysis_timestamp.isoformat()
                            if hasattr(session, "analysis_timestamp")
                            and session.analysis_timestamp
                            else None
                        ),
                    },
                    "metadata": {
                        "filename": session.original_filename,
                        "rows": getattr(session, "row_count", 0) or 0,
                        "columns": getattr(session, "column_count", 0) or 0,
                        "total_customers": customer_data["total_customers"],
                        "analysis_date": customer_data["analysis_date"],
                    },
                    "analysis_data": {
                        "customers": customer_data["customers"],
                        "segment_counts": customer_data["segment_counts"],
                        "rfm_stats": customer_data["rfm_stats"],
                    },
                    "visualization": {
                        "plot_image": (
                            visualization.image_base64 if visualization else None
                        ),
                        "width": visualization.width if visualization else 1600,
                        "height": visualization.height if visualization else 1200,
                    },
                },
            }

            print(f"✅ RFM分析セッション詳細取得完了")
            return response_data

        except Exception as e:
            print(f"❌ RFM分析セッション詳細取得エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return {"success": False, "error": str(e)}

    async def get_session_detail_async(self, session_id: int, db: Session):
        """RFM分析セッション詳細取得のパブリックメソッド"""
        return self._get_session_detail_directly(db, session_id)
