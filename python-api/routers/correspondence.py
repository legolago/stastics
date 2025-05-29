from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import chi2_contingency
import base64
import io
from typing import Optional, List, Dict, Any
from datetime import datetime

from models import (
    get_db,
    AnalysisSession,
    OriginalData,
    CoordinatesData,
    VisualizationData,
    EigenvalueData,
)

router = APIRouter(prefix="/correspondence", tags=["correspondence"])


class SimpleCorrespondenceAnalyzer:
    """シンプルなコレスポンデンス分析クラス"""

    def get_analysis_type(self):
        return "correspondence"

    def analyze(self, df: pd.DataFrame, n_components: int = 2) -> Dict[str, Any]:
        """コレスポンデンス分析を実行"""
        try:
            print(f"=== 分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")

            # データの検証と前処理
            df_processed = self._preprocess_data(df)
            print(f"前処理後データ:\n{df_processed}")

            # コレスポンデンス分析の計算
            results = self._compute_correspondence_analysis(df_processed, n_components)

            print(f"分析結果: {list(results.keys())}")
            return results

        except Exception as e:
            print(f"分析エラー: {str(e)}")
            import traceback

            print(f"トレースバック:\n{traceback.format_exc()}")
            raise

    def _preprocess_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """データの前処理"""
        df_clean = df.copy()

        # 数値型に変換
        for col in df_clean.columns:
            df_clean[col] = pd.to_numeric(df_clean[col], errors="coerce")

        # NaNを0で埋める
        df_clean = df_clean.fillna(0)

        # 負の値を絶対値に変換
        df_clean = df_clean.abs()

        # 全てゼロの行・列を削除
        row_sums = df_clean.sum(axis=1)
        col_sums = df_clean.sum(axis=0)

        df_clean = df_clean[row_sums > 0]
        df_clean = df_clean.loc[:, col_sums > 0]

        print(f"前処理: {df.shape} -> {df_clean.shape}")

        if df_clean.empty or df_clean.shape[0] < 2 or df_clean.shape[1] < 2:
            raise ValueError("有効なデータが不足しています（最低2×2のデータが必要）")

        return df_clean

    def _compute_correspondence_analysis(
        self, df: pd.DataFrame, n_components: int
    ) -> Dict[str, Any]:
        """コレスポンデンス分析の計算"""
        try:
            # 基本統計
            N = df.sum().sum()  # 総計
            row_totals = df.sum(axis=1)
            col_totals = df.sum(axis=0)

            print(f"総計: {N}")
            print(f"行合計: {row_totals.to_dict()}")
            print(f"列合計: {col_totals.to_dict()}")

            # 相対度数表
            P = df / N
            r = row_totals / N  # 行周辺度数
            c = col_totals / N  # 列周辺度数

            # 期待度数行列
            E = np.outer(r, c)

            # 標準化残差行列
            residuals = (P - E) / np.sqrt(E)
            residuals = np.nan_to_num(residuals, 0)  # NaNを0に置換

            print(f"残差行列:\n{residuals}")

            # 特異値分解
            U, sigma, Vt = np.linalg.svd(residuals, full_matrices=False)

            print(f"特異値: {sigma}")

            # 有効な次元数を決定
            valid_sigma = sigma[sigma > 1e-10]  # 非常に小さい値を除外
            max_dims = len(valid_sigma)
            n_components = min(n_components, max_dims, df.shape[0] - 1, df.shape[1] - 1)

            if n_components <= 0:
                n_components = 1

            print(f"使用する次元数: {n_components}")

            # 固有値（慣性）
            eigenvalues = (valid_sigma[:n_components] ** 2).tolist()
            total_inertia = float(np.sum(sigma**2))

            # 寄与率の計算
            if total_inertia > 0:
                explained_inertia = [ev / total_inertia for ev in eigenvalues]
            else:
                explained_inertia = [0.0] * n_components

            cumulative_inertia = np.cumsum(explained_inertia).tolist()

            # 座標の計算
            try:
                # 行座標
                Dr_inv_sqrt = np.diag(1 / np.sqrt(r.values))
                row_coords = Dr_inv_sqrt @ U[:, :n_components]
                for i in range(n_components):
                    row_coords[:, i] *= valid_sigma[i]

                # 列座標
                Dc_inv_sqrt = np.diag(1 / np.sqrt(c.values))
                col_coords = Dc_inv_sqrt @ Vt[:n_components, :].T
                for i in range(n_components):
                    col_coords[:, i] *= valid_sigma[i]

                # 次元が不足している場合はゼロパディング
                if n_components == 1:
                    row_coords = np.column_stack(
                        [row_coords, np.zeros(row_coords.shape[0])]
                    )
                    col_coords = np.column_stack(
                        [col_coords, np.zeros(col_coords.shape[0])]
                    )

                print(f"行座標形状: {row_coords.shape}")
                print(f"列座標形状: {col_coords.shape}")

            except Exception as coord_error:
                print(f"座標計算エラー: {coord_error}")
                # フォールバック: ゼロ座標
                row_coords = np.zeros((df.shape[0], 2))
                col_coords = np.zeros((df.shape[1], 2))

            # カイ二乗検定
            try:
                chi2_stat, p_value, dof, expected = chi2_contingency(df)
            except:
                chi2_stat, p_value, dof = 0.0, 1.0, 0

            results = {
                "total_inertia": total_inertia,
                "chi2": float(chi2_stat),
                "p_value": float(p_value),
                "degrees_of_freedom": int(dof),
                "eigenvalues": eigenvalues,
                "explained_inertia": explained_inertia,
                "cumulative_inertia": cumulative_inertia,
                "row_coordinates": row_coords,
                "column_coordinates": col_coords,
                "n_components": n_components,
            }

            return results

        except Exception as e:
            print(f"計算エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            raise

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """プロットの作成"""
        try:
            print("=== プロット作成開始 ===")

            row_coords = results["row_coordinates"]
            col_coords = results["column_coordinates"]
            explained_inertia = results["explained_inertia"]

            # 日本語フォント設定（強化版）
            self._setup_japanese_font()

            # データ準備
            row_df = pd.DataFrame(
                {
                    "x": row_coords[:, 0],
                    "y": row_coords[:, 1],
                    "type": "イメージ",
                    "label": [str(name) for name in df.index],
                    "size": 100,
                }
            )

            col_df = pd.DataFrame(
                {
                    "x": col_coords[:, 0],
                    "y": col_coords[:, 1],
                    "type": "ブランド",
                    "label": [str(name) for name in df.columns],
                    "size": 100,
                }
            )

            all_points = pd.concat([row_df, col_df], ignore_index=True)

            # ラベル位置の最適化
            all_points = self._optimize_label_positions(all_points)

            # プロット作成
            fig, ax = plt.subplots(figsize=(14, 11))

            # 背景設定
            fig.patch.set_facecolor("white")
            ax.set_facecolor("white")

            # カスタムカラーとマーカー（元のデザインに合わせて）
            colors = {"イメージ": "#3498db", "ブランド": "#e74c3c"}
            markers = {"イメージ": "o", "ブランド": "D"}

            # タイトルと軸ラベル（日本語フォント明示）
            ax.set_title(
                "ファッションブランドとイメージのコレスポンデンス分析",
                fontsize=18,
                fontweight="bold",
                pad=20,
                fontfamily=["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"],
                color="#333333",
            )

            if len(explained_inertia) >= 2:
                ax.set_xlabel(
                    f"第1次元 ({explained_inertia[0]*100:.1f}% の寄与率)",
                    fontsize=14,
                    labelpad=10,
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                    color="#333333",
                )
                ax.set_ylabel(
                    f"第2次元 ({explained_inertia[1]*100:.1f}% の寄与率)",
                    fontsize=14,
                    labelpad=10,
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                    color="#333333",
                )

            # 原点の軸線とグリッド
            ax.axhline(y=0, color="gray", linestyle="--", alpha=0.5, zorder=0)
            ax.axvline(x=0, color="gray", linestyle="--", alpha=0.5, zorder=0)
            ax.grid(True, linestyle=":", linewidth=0.5, alpha=0.6)

            # 各タイプごとにプロット
            for point_type in all_points["type"].unique():
                subset = all_points[all_points["type"] == point_type]

                # マーカーをプロット
                ax.scatter(
                    subset["x"],
                    subset["y"],
                    s=subset["size"],
                    marker=markers[point_type],
                    c=colors[point_type],
                    label=point_type,
                    alpha=0.8,
                    edgecolor="white",
                    linewidth=0.5,
                    zorder=3,
                )

                # ラベルと矢印を追加
                for _, row in subset.iterrows():
                    x, y = row["x"], row["y"]
                    label_x, label_y = row["label_x"], row["label_y"]

                    # 距離が一定以上の場合のみ矢印を表示
                    dist = np.sqrt((label_x - x) ** 2 + (label_y - y) ** 2)
                    if dist > 0.05:
                        ax.annotate(
                            "",
                            xy=(x, y),
                            xytext=(label_x, label_y),
                            arrowprops=dict(
                                arrowstyle="-", color="gray", alpha=0.5, linewidth=0.5
                            ),
                            zorder=1,
                        )

                    # テキストを境界線付きで表示
                    ax.text(
                        label_x,
                        label_y,
                        row["label"],
                        fontsize=11,
                        ha="center",
                        va="center",
                        weight="bold",
                        color="black",
                        zorder=5,
                        fontfamily=[
                            "IPAexGothic",
                            "IPAGothic",
                            "DejaVu Sans",
                            "sans-serif",
                        ],
                        path_effects=[
                            plt.matplotlib.patheffects.withStroke(
                                linewidth=3, foreground="white"
                            )
                        ],
                    )

            # 凡例
            legend = ax.legend(
                title="タイプ",
                fontsize=12,
                title_fontsize=13,
                loc="best",
                frameon=True,
                framealpha=0.9,
                edgecolor="gray",
                prop={
                    "family": ["IPAexGothic", "IPAGothic", "DejaVu Sans", "sans-serif"]
                },
            )
            legend.get_frame().set_linewidth(0.8)

            # 情報ボックス
            if len(explained_inertia) >= 2:
                total_inertia_ratio = (
                    explained_inertia[0] + explained_inertia[1]
                ) * 100
                info_text = f"総慣性: {results.get('total_inertia', 0)*100:.1f}%\n"
                info_text += f"第1次元と第2次元で{total_inertia_ratio:.1f}%の情報を説明"

                ax.text(
                    0.02,
                    0.98,
                    info_text,
                    transform=ax.transAxes,
                    fontsize=11,
                    bbox=dict(
                        boxstyle="round,pad=0.5",
                        facecolor="white",
                        alpha=0.8,
                        edgecolor="gray",
                        linewidth=0.5,
                    ),
                    verticalalignment="top",
                    fontfamily=[
                        "IPAexGothic",
                        "IPAGothic",
                        "DejaVu Sans",
                        "sans-serif",
                    ],
                    zorder=5,
                )

            # 座標範囲の設定
            x_coords = np.concatenate(
                [all_points["x"].values, all_points["label_x"].values]
            )
            y_coords = np.concatenate(
                [all_points["y"].values, all_points["label_y"].values]
            )
            x_min, x_max = np.min(x_coords), np.max(x_coords)
            y_min, y_max = np.min(y_coords), np.max(y_coords)

            margin = 0.1
            ax.set_xlim(
                x_min - margin * (x_max - x_min), x_max + margin * (x_max - x_min)
            )
            ax.set_ylim(
                y_min - margin * (y_max - y_min), y_max + margin * (y_max - y_min)
            )

            # 軸の境界線設定
            for spine in ax.spines.values():
                spine.set_color("#CCCCCC")
                spine.set_linewidth(1)

            # ティック設定
            ax.tick_params(colors="#666666", labelsize=10)

            plt.tight_layout()

            # Base64エンコード
            buffer = io.BytesIO()
            plt.savefig(
                buffer,
                format="png",
                dpi=300,
                bbox_inches="tight",
                facecolor="white",
                edgecolor="none",
            )
            buffer.seek(0)
            plot_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            plt.close()

            print(f"プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def _setup_japanese_font(self):
        """日本語フォントの設定"""
        try:
            # matplotlib の patheffects をインポート
            import matplotlib.patheffects

            # フォント設定を強制的に適用
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

            print("Japanese font setup completed")

        except Exception as e:
            print(f"Font setup error: {e}")
            # フォールバック設定
            plt.rcParams.update(
                {
                    "font.family": ["DejaVu Sans", "sans-serif"],
                    "axes.unicode_minus": False,
                }
            )

    def _optimize_label_positions(self, points):
        """ラベル位置を最適化"""
        points = points.copy()
        points["label_x"] = points["x"]
        points["label_y"] = points["y"]

        try:
            coords = points[["x", "y"]].values

            # 距離行列を計算
            from scipy.spatial.distance import pdist, squareform

            distances = squareform(pdist(coords))
            np.fill_diagonal(distances, np.inf)

            min_distances = np.min(distances, axis=1)
            avg_distance = np.median(min_distances)
            base_offset = avg_distance * 0.3

            for i, (idx, row) in enumerate(points.iterrows()):
                x, y = row["x"], row["y"]

                # 近隣点の数を計算
                neighbors = np.sum(distances[i] < avg_distance)
                density_factor = min(1.0 + (neighbors * 0.15), 2.0)

                # 角度に基づいてオフセットを決定
                angle = np.arctan2(y, x) if (x != 0 or y != 0) else 0

                if abs(angle) <= np.pi / 4:  # 右方向
                    dx, dy = base_offset * density_factor, 0
                elif abs(angle) >= 3 * np.pi / 4:  # 左方向
                    dx, dy = -base_offset * density_factor, 0
                elif angle > 0:  # 上方向
                    dx, dy = 0, base_offset * density_factor
                else:  # 下方向
                    dx, dy = 0, -base_offset * density_factor

                points.at[idx, "label_x"] = x + dx
                points.at[idx, "label_y"] = y + dy

        except Exception as e:
            print(f"Label optimization warning: {e}")
            # フォールバック: 元の位置を使用

        return points


def save_to_database(
    db: Session,
    analyzer,
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
    """データベースに保存"""
    try:
        print("=== データベース保存開始 ===")
        print(f"セッション名: {session_name}")
        print(f"ユーザーID: {user_id}")
        print(f"ファイル名: {file.filename}")

        # セッション作成
        session = AnalysisSession(
            session_name=session_name,
            description=description or "",
            tags=tags,
            user_id=user_id,
            original_filename=file.filename,
            analysis_timestamp=datetime.utcnow(),
            analysis_type="correspondence",
            row_count=df.shape[0],
            column_count=df.shape[1],
            total_inertia=results.get("total_inertia", 0.0),
            chi2_value=results.get("chi2", 0.0),
            degrees_of_freedom=results.get("degrees_of_freedom", 0),
        )

        db.add(session)
        db.flush()
        session_id = session.id

        print(f"セッション作成完了: ID={session_id}")

        # 各種データの保存（エラーが発生しても継続）
        try:
            # 元データ
            original_data = OriginalData(
                session_id=session_id,
                csv_data=csv_text,
                data_matrix=df.values.tolist(),
                row_names=df.index.tolist(),
                column_names=df.columns.tolist(),
            )
            db.add(original_data)
            print("元データ保存完了")
        except Exception as e:
            print(f"元データ保存エラー: {e}")
            import traceback

            print(f"詳細: {traceback.format_exc()}")

        try:
            # 座標データ
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
                print(f"行座標データ保存完了: {len(df.index)}件")

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
                print(f"列座標データ保存完了: {len(df.columns)}件")
        except Exception as e:
            print(f"座標データ保存エラー: {e}")
            import traceback

            print(f"詳細: {traceback.format_exc()}")

        try:
            # 固有値データ
            eigenvalues = results.get("eigenvalues", [])
            explained_inertia = results.get("explained_inertia", [])
            cumulative_inertia = results.get("cumulative_inertia", [])

            print(f"固有値データ保存中: {len(eigenvalues)}次元")

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
            print("固有値データ保存完了")
        except Exception as e:
            print(f"固有値データ保存エラー: {e}")
            import traceback

            print(f"詳細: {traceback.format_exc()}")

        try:
            # 可視化データ - より詳細なフィールド調整
            if plot_base64:
                # VisualizationDataモデルの利用可能なフィールドを確認
                viz_data = {}
                viz_data["session_id"] = session_id

                # 必要に応じてフィールドを設定
                if hasattr(VisualizationData, "image_base64"):
                    viz_data["image_base64"] = plot_base64
                if hasattr(VisualizationData, "image_data"):
                    viz_data["image_data"] = b""  # 空のバイト配列
                if hasattr(VisualizationData, "width"):
                    viz_data["width"] = 1400
                if hasattr(VisualizationData, "height"):
                    viz_data["height"] = 1100
                if hasattr(VisualizationData, "image_size"):
                    viz_data["image_size"] = len(plot_base64)
                if hasattr(VisualizationData, "dpi"):
                    viz_data["dpi"] = 300
                if hasattr(VisualizationData, "image_type"):
                    viz_data["image_type"] = "correspondence_plot"
                if hasattr(VisualizationData, "created_at"):
                    viz_data["created_at"] = datetime.utcnow()

                visualization_data = VisualizationData(**viz_data)
                db.add(visualization_data)
                print(f"可視化データ保存完了: {len(plot_base64)}文字")
            else:
                print("警告: プロット画像が空です")
        except Exception as e:
            print(f"可視化データ保存エラー: {e}")
            import traceback

            print(f"詳細: {traceback.format_exc()}")

            # 可視化データなしでも処理を継続
            print("可視化データ保存をスキップして処理を継続します")

        # コミット前の確認
        print("データベースコミット実行中...")
        db.commit()
        print(f"データベース保存完了: session_id={session_id}")

        # 保存確認のクエリ
        try:
            saved_session = (
                db.query(AnalysisSession)
                .filter(AnalysisSession.id == session_id)
                .first()
            )
            if saved_session:
                print(f"保存確認OK: {saved_session.session_name}")
            else:
                print("警告: 保存されたセッションが見つかりません")
        except Exception as e:
            print(f"保存確認エラー: {e}")

        return session_id

    except Exception as e:
        print(f"データベース保存で致命的エラー: {str(e)}")
        import traceback

        print(f"詳細エラー:\n{traceback.format_exc()}")
        db.rollback()
        return 0


@router.post("/analyze")
async def analyze_correspondence(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    n_components: int = Query(2, description="次元数"),
    db: Session = Depends(get_db),
):
    """コレスポンデンス分析を実行"""
    try:
        print(f"=== API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"次元数: {n_components}")

        # CSVファイル読み込み
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        contents = await file.read()
        csv_text = contents.decode("utf-8")
        print(f"CSVテキスト:\n{csv_text}")

        df = pd.read_csv(io.StringIO(csv_text), index_col=0)
        print(f"データフレーム:\n{df}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 分析実行
        analyzer = SimpleCorrespondenceAnalyzer()
        ca_results = analyzer.analyze(df, n_components=n_components)

        # プロット作成
        plot_base64 = analyzer.create_plot(ca_results, df)

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # データベース保存
        session_id = save_to_database(
            db=db,
            analyzer=analyzer,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            df=df,
            results=ca_results,
            plot_base64=plot_base64,
        )

        # レスポンス作成
        response_data = {
            "success": True,
            "session_id": session_id,
            "analysis_type": "correspondence",
            "data": {
                "total_inertia": float(ca_results.get("total_inertia", 0)),
                "chi2": float(ca_results.get("chi2", 0)),
                "eigenvalues": [float(x) for x in ca_results.get("eigenvalues", [])],
                "explained_inertia": [
                    float(x) for x in ca_results.get("explained_inertia", [])
                ],
                "cumulative_inertia": [
                    float(x) for x in ca_results.get("cumulative_inertia", [])
                ],
                "degrees_of_freedom": ca_results.get("degrees_of_freedom", 0),
                "plot_image": plot_base64,
                "coordinates": {
                    "rows": [
                        {
                            "name": str(name),
                            "dimension_1": float(ca_results["row_coordinates"][i, 0]),
                            "dimension_2": float(ca_results["row_coordinates"][i, 1]),
                        }
                        for i, name in enumerate(df.index)
                    ],
                    "columns": [
                        {
                            "name": str(name),
                            "dimension_1": float(
                                ca_results["column_coordinates"][i, 0]
                            ),
                            "dimension_2": float(
                                ca_results["column_coordinates"][i, 1]
                            ),
                        }
                        for i, name in enumerate(df.columns)
                    ],
                },
            },
            "metadata": {
                "session_name": session_name,
                "filename": file.filename,
                "rows": df.shape[0],
                "columns": df.shape[1],
                "row_names": [str(x) for x in df.index],
                "column_names": [str(x) for x in df.columns],
            },
        }

        print("=== API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_correspondence_methods():
    """コレスポンデンス分析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "standard",
                "display_name": "標準コレスポンデンス分析",
                "description": "基本的なコレスポンデンス分析",
                "parameters": {
                    "n_components": {
                        "type": "integer",
                        "default": 2,
                        "min": 2,
                        "max": 10,
                        "description": "抽出する次元数",
                    }
                },
            }
        ]
    }


@router.get("/parameters/validate")
async def validate_parameters(n_components: int = Query(2, description="次元数")):
    """パラメータの妥当性をチェック"""
    errors = []

    if n_components < 2:
        errors.append("次元数は2以上である必要があります")
    if n_components > 10:
        errors.append("次元数は10以下である必要があります")

    return {"valid": len(errors) == 0, "errors": errors}
