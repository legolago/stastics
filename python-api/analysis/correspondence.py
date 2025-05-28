from typing import Dict, Any
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm  # この行を追加！
import matplotlib.patheffects as pe
import japanize_matplotlib
import prince
from scipy.spatial import distance_matrix
from .base import BaseAnalyzer


# 日本語フォント設定関数
def setup_japanese_font():
    """日本語フォントを設定"""
    try:
        # 利用可能なフォントを確認
        available_fonts = [f.name for f in fm.fontManager.ttflist]
        ipa_fonts = [f for f in available_fonts if "IPA" in f or "Gothic" in f]
        print("Available IPA fonts:", ipa_fonts)

        # フォント設定を強制的に適用
        plt.rcParams.update(
            {
                "font.family": ["IPAexGothic", "IPAGothic", "sans-serif"],
                "axes.unicode_minus": False,
                "font.size": 12,
            }
        )

        # フォントキャッシュをクリア（新しい方法）
        fm.fontManager.__init__()

        # 設定されたフォントを確認
        current_font = plt.rcParams["font.family"]
        print(f"Font family set to: {current_font}")

        # テスト用の日本語描画
        test_fig, test_ax = plt.subplots(figsize=(1, 1))
        test_ax.text(0.5, 0.5, "テスト", fontsize=12)
        plt.close(test_fig)

        print("Japanese font setup completed successfully")

    except Exception as e:
        print(f"Font setup error: {e}")
        # フォールバック: japanize_matplotlibに完全に依存
        import japanize_matplotlib

        plt.rcParams["axes.unicode_minus"] = False
        print("Using japanize_matplotlib as fallback")


class CorrespondenceAnalyzer(BaseAnalyzer):
    """コレスポンデンス分析クラス"""

    def get_analysis_type(self) -> str:
        return "correspondence"

    def analyze(
        self, df: pd.DataFrame, n_components: int = 2, **kwargs
    ) -> Dict[str, Any]:
        """コレスポンデンス分析を実行"""
        self.validate_data(df)

        # princeパッケージを使用してCA実行
        ca = prince.CA(n_components=n_components)
        ca = ca.fit(df)

        row_coordinates = ca.row_coordinates(df)
        column_coordinates = ca.column_coordinates(df)
        eigenvalues = ca.eigenvalues_

        total_inertia = sum(eigenvalues)
        explained_inertia = np.array(eigenvalues) / total_inertia
        chi2 = total_inertia * df.values.sum()

        results = {
            "model": ca,
            "row_coordinates": row_coordinates,
            "column_coordinates": column_coordinates,
            "eigenvalues": eigenvalues,
            "explained_inertia": explained_inertia,
            "cumulative_inertia": np.cumsum(explained_inertia),
            "total_inertia": total_inertia,
            "chi2": chi2,
            "degrees_of_freedom": (df.shape[0] - 1) * (df.shape[1] - 1),
            "n_components": n_components,
        }

        self.results = results
        return results

    def create_plot(self, results: Dict[str, Any], df: pd.DataFrame) -> str:
        """コレスポンデンス分析のプロットを作成"""
        # 日本語フォント設定を最初に適用
        import japanize_matplotlib  # 確実に日本語フォントを設定

        plt.rcParams.update(
            {
                "font.family": ["IPAexGothic", "IPAGothic", "sans-serif"],
                "axes.unicode_minus": False,
                "font.size": 12,
            }
        )

        setup_japanese_font()  # 追加の設定

        row_coords = results["row_coordinates"]
        col_coords = results["column_coordinates"]
        explained_inertia = results["explained_inertia"]

        # データフレーム準備
        row_df = row_coords.copy()
        row_df["type"] = "イメージ"
        row_df["label"] = row_df.index
        row_df["size"] = 100

        col_df = col_coords.copy()
        col_df["type"] = "ブランド"
        col_df["label"] = col_df.index
        col_df["size"] = 100

        all_points = pd.concat([row_df, col_df])

        # 次元カラムを特定
        dim_cols = [
            col for col in all_points.columns if col not in ["type", "label", "size"]
        ][:2]
        dim1_col, dim2_col = dim_cols[0], dim_cols[1]

        # ラベル位置の最適化
        all_points = self._optimize_label_positions(all_points, dim1_col, dim2_col)

        # プロット作成
        fig, ax = plt.subplots(figsize=(14, 11))
        self.create_common_plot_style()

        # カスタムカラーとマーカー
        colors = {"イメージ": "#3498db", "ブランド": "#e74c3c"}
        markers = {"イメージ": "o", "ブランド": "D"}

        # タイトルと軸ラベル（日本語）- フォントを明示的に指定
        plt.title(
            "ファッションブランドとイメージのコレスポンデンス分析",
            fontsize=18,
            fontweight="bold",
            pad=20,
            fontfamily=["IPAexGothic", "IPAGothic", "sans-serif"],
        )
        plt.xlabel(
            f"第1次元 ({explained_inertia[0]:.1%} の寄与率)",
            fontsize=14,
            labelpad=10,
            fontfamily=["IPAexGothic", "IPAGothic", "sans-serif"],
        )
        plt.ylabel(
            f"第2次元 ({explained_inertia[1]:.1%} の寄与率)",
            fontsize=14,
            labelpad=10,
            fontfamily=["IPAexGothic", "IPAGothic", "sans-serif"],
        )

        # 原点の軸線
        plt.axhline(y=0, color="gray", linestyle="--", alpha=0.5, zorder=0)
        plt.axvline(x=0, color="gray", linestyle="--", alpha=0.5, zorder=0)
        plt.grid(True, linestyle=":", linewidth=0.5, alpha=0.6)

        # 各タイプごとにプロット
        for point_type in all_points["type"].unique():
            subset = all_points[all_points["type"] == point_type]

            # マーカーをプロット
            plt.scatter(
                subset[dim1_col],
                subset[dim2_col],
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
                x, y = row[dim1_col], row[dim2_col]
                label_x, label_y = row["label_x"], row["label_y"]

                # 距離が一定以上の場合のみ矢印を表示
                dist = np.sqrt((label_x - x) ** 2 + (label_y - y) ** 2)
                if dist > 0.05:
                    plt.annotate(
                        "",
                        xy=(x, y),
                        xytext=(label_x, label_y),
                        arrowprops=dict(
                            arrowstyle="-", color="gray", alpha=0.5, linewidth=0.5
                        ),
                        zorder=1,
                    )

                # テキストを境界線付きで表示 - フォントを明示的に指定
                plt.text(
                    label_x,
                    label_y,
                    row["label"],
                    fontsize=11,
                    ha="center",
                    va="center",
                    weight="bold",
                    color="black",
                    zorder=5,
                    fontfamily=["IPAexGothic", "IPAGothic", "sans-serif"],
                    path_effects=[pe.withStroke(linewidth=3, foreground="white")],
                )

        # 凡例 - フォントを明示的に指定
        legend = plt.legend(
            title="タイプ",
            fontsize=12,
            title_fontsize=13,
            loc="best",
            frameon=True,
            framealpha=0.9,
            edgecolor="gray",
            prop={"family": ["IPAexGothic", "IPAGothic", "sans-serif"]},
        )
        legend.get_frame().set_linewidth(0.8)
        legend.get_title().set_fontfamily(["IPAexGothic", "IPAGothic", "sans-serif"])

        # 情報ボックス
        total_inertia = sum(results["explained_inertia"][:2])
        info_text = f"総慣性: {results['total_inertia']:.1%}\n"
        info_text += f"第1次元と第2次元で{total_inertia:.1%}の情報を説明"

        plt.annotate(
            info_text,
            xy=(0.02, 0.98),
            xycoords="axes fraction",
            fontsize=11,
            bbox=dict(
                boxstyle="round,pad=0.5",
                facecolor="white",
                alpha=0.8,
                edgecolor="gray",
                linewidth=0.5,
            ),
            verticalalignment="top",
            zorder=5,
        )

        # 座標範囲の設定
        x_coords = all_points[[dim1_col, "label_x"]].values.flatten()
        y_coords = all_points[[dim2_col, "label_y"]].values.flatten()
        x_min, x_max = np.min(x_coords), np.max(x_coords)
        y_min, y_max = np.min(y_coords), np.max(y_coords)

        margin = 0.1
        plt.xlim(x_min - margin * (x_max - x_min), x_max + margin * (x_max - x_min))
        plt.ylim(y_min - margin * (y_max - y_min), y_max + margin * (y_max - y_min))

        plt.tight_layout()

        return self.save_plot_as_base64(fig)

    def _optimize_label_positions(self, points, dim1_col, dim2_col):
        """ラベル位置を最適化"""
        points["label_x"] = points[dim1_col]
        points["label_y"] = points[dim2_col]

        coords = points[[dim1_col, dim2_col]].values

        try:
            dist_matrix = distance_matrix(coords, coords)
            np.fill_diagonal(dist_matrix, np.inf)

            min_distances = np.min(dist_matrix, axis=1)
            avg_distance = np.median(min_distances)
            base_offset = avg_distance * 0.3

            for i, (idx, row) in enumerate(points.iterrows()):
                x, y = row[dim1_col], row[dim2_col]

                neighbors = np.sum(dist_matrix[i] < avg_distance)
                density_factor = min(1.0 + (neighbors * 0.15), 2.0)

                angle = np.arctan2(y, x) if (x != 0 or y != 0) else 0

                if abs(angle) <= np.pi / 4:
                    dx, dy = base_offset * density_factor, 0
                elif abs(angle) >= 3 * np.pi / 4:
                    dx, dy = -base_offset * density_factor, 0
                elif angle > 0:
                    dx, dy = 0, base_offset * density_factor
                else:
                    dx, dy = 0, -base_offset * density_factor

                points.at[idx, "label_x"] = x + dx
                points.at[idx, "label_y"] = y + dy

        except Exception as e:
            print(f"Label optimization warning: {e}")

        return points

    def get_coordinates_data(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """座標データを取得"""
        row_coords = results["row_coordinates"]
        col_coords = results["column_coordinates"]

        dim_cols = list(row_coords.columns)[:2]

        return {
            "rows": [
                {
                    "name": str(idx),
                    "dimension_1": float(row[dim_cols[0]]) if len(dim_cols) > 0 else 0,
                    "dimension_2": float(row[dim_cols[1]]) if len(dim_cols) > 1 else 0,
                }
                for idx, row in row_coords.iterrows()
            ],
            "columns": [
                {
                    "name": str(idx),
                    "dimension_1": float(row[dim_cols[0]]) if len(dim_cols) > 0 else 0,
                    "dimension_2": float(row[dim_cols[1]]) if len(dim_cols) > 1 else 0,
                }
                for idx, row in col_coords.iterrows()
            ],
        }
