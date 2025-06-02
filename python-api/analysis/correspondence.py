# python-api/analysis/correspondence.py
from typing import Dict, Any
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as pe
from scipy.stats import chi2_contingency
from scipy.spatial.distance import pdist, squareform
from .base import BaseAnalyzer


class CorrespondenceAnalyzer(BaseAnalyzer):
    """コレスポンデンス分析クラス"""

    def get_analysis_type(self) -> str:
        return "correspondence"

    def analyze(
        self, df: pd.DataFrame, n_components: int = 2, **kwargs
    ) -> Dict[str, Any]:
        """コレスポンデンス分析を実行"""
        try:
            print(f"=== 分析開始 ===")
            print(f"入力データ:\n{df}")
            print(f"データ形状: {df.shape}")

            # データの検証と前処理
            df_processed = self._preprocess_correspondence_data(df)
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

    def _preprocess_correspondence_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """コレスポンデンス分析用のデータ前処理"""
        df_clean = self.preprocess_data(df)  # 基底クラスの前処理を使用

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
        """コレスポンデンス分析のプロットを作成"""
        try:
            print("=== プロット作成開始 ===")

            row_coords = results["row_coordinates"]
            col_coords = results["column_coordinates"]
            explained_inertia = results["explained_inertia"]

            # 日本語フォント設定
            self.setup_japanese_font()

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
                        path_effects=[pe.withStroke(linewidth=3, foreground="white")],
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
            plot_base64 = self.save_plot_as_base64(fig)
            print(f"プロット作成完了")
            return plot_base64

        except Exception as e:
            print(f"プロット作成エラー: {str(e)}")
            import traceback

            print(f"詳細:\n{traceback.format_exc()}")
            return ""

    def _optimize_label_positions(self, points):
        """ラベル位置を最適化"""
        points = points.copy()
        points["label_x"] = points["x"]
        points["label_y"] = points["y"]

        try:
            coords = points[["x", "y"]].values

            # 距離行列を計算
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
        row_coords = results["row_coordinates"]
        col_coords = results["column_coordinates"]

        return {
            "success": True,
            "session_id": session_id,
            "analysis_type": self.get_analysis_type(),
            "data": {
                "total_inertia": float(results.get("total_inertia", 0)),
                "chi2": float(results.get("chi2", 0)),
                "eigenvalues": [float(x) for x in results.get("eigenvalues", [])],
                "explained_inertia": [
                    float(x) for x in results.get("explained_inertia", [])
                ],
                "cumulative_inertia": [
                    float(x) for x in results.get("cumulative_inertia", [])
                ],
                "degrees_of_freedom": results.get("degrees_of_freedom", 0),
                "plot_image": plot_base64,
                "coordinates": {
                    "rows": [
                        {
                            "name": str(name),
                            "dimension_1": float(row_coords[i, 0]),
                            "dimension_2": float(row_coords[i, 1]),
                        }
                        for i, name in enumerate(df.index)
                    ],
                    "columns": [
                        {
                            "name": str(name),
                            "dimension_1": float(col_coords[i, 0]),
                            "dimension_2": float(col_coords[i, 1]),
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
