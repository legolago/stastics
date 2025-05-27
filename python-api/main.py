from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib

matplotlib.use("Agg")  # GUIバックエンドを無効化
import matplotlib.font_manager as fm
import matplotlib.patheffects as pe
import seaborn as sns
import japanize_matplotlib  # 日本語フォント対応
import prince
import io
import base64
import os
from typing import Dict, Any, List, Optional
from scipy.spatial import distance_matrix
import warnings
from datetime import datetime
import json

# データベースモデルのインポート
from models import (
    AnalysisSession,
    OriginalData,
    CoordinatesData,
    VisualizationData,
    EigenvalueData,
    get_db,
    create_tables,
)

warnings.filterwarnings("ignore", category=UserWarning)


# 日本語フォントの設定を強制的に適用
def setup_japanese_font():
    """日本語フォントを設定"""
    try:
        # IPAフォントの設定
        plt.rcParams["font.family"] = [
            "IPAexGothic",
            "IPAGothic",
            "DejaVu Sans",
            "sans-serif",
        ]
        plt.rcParams["axes.unicode_minus"] = False

        # フォントキャッシュをクリア
        fm._rebuild()

        print("Japanese font setup completed with IPAexGothic")

    except Exception as e:
        print(f"Font setup warning: {e}")
        # フォールバック設定
        plt.rcParams["font.family"] = ["DejaVu Sans", "sans-serif"]
        plt.rcParams["axes.unicode_minus"] = False


# FastAPIアプリケーションを作成
app = FastAPI(title="コレスポンデンス分析API", version="1.0.0")

# データベーステーブルを作成
create_tables()

# 日本語フォントを設定
setup_japanese_font()

# CORS設定（Next.jsからのアクセスを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.jsのURL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CorrespondenceAnalyzer:
    """コレスポンデンス分析クラス"""

    def __init__(self):
        self.ca_results = None
        self.df = None

    def ca_with_prince(self, df: pd.DataFrame, n_components: int = 2) -> Dict[str, Any]:
        """princeパッケージを使用したコレスポンデンス分析"""
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
            "total_inertia": total_inertia,
            "chi2": chi2,
        }

        return results

    def create_plot(self, ca_results: Dict[str, Any], df: pd.DataFrame) -> str:
        """プロットを作成してBase64エンコードした画像を返す（日本語対応版・改良版）"""
        row_coords = ca_results["row_coordinates"]
        col_coords = ca_results["column_coordinates"]
        explained_inertia = ca_results["explained_inertia"]

        # データフレーム用に情報を追加
        row_df = row_coords.copy()
        row_df["type"] = "イメージ"
        row_df["label"] = row_df.index
        row_df["size"] = 100

        col_df = col_coords.copy()
        col_df["type"] = "ブランド"
        col_df["label"] = col_df.index
        col_df["size"] = 100

        # データを結合
        all_points = pd.concat([row_df, col_df])

        # カラム名の確認と修正
        dim_cols = [
            col for col in all_points.columns if col not in ["type", "label", "size"]
        ][:2]
        dim1_col = dim_cols[0]
        dim2_col = dim_cols[1]

        # ラベル位置の最適化
        all_points = self.optimize_label_positions(all_points, dim1_col, dim2_col)

        # 美しい可視化のための設定
        plt.figure(figsize=(14, 11))
        sns.set_style("whitegrid", {"grid.linestyle": ":"})

        # 日本語フォント設定を再適用
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

        # カスタムカラー
        colors = {
            "イメージ": "#3498db",  # 鮮やかな青
            "ブランド": "#e74c3c",  # 華やかな赤
        }

        # カスタムマーカー
        markers = {
            "イメージ": "o",  # 円形
            "ブランド": "D",  # ダイヤモンド形
        }

        # タイトルと軸ラベル
        plt.title(
            "ファッションブランドとイメージのコレスポンデンス分析",
            fontsize=18,
            fontweight="bold",
            pad=20,
        )
        plt.xlabel(
            f"第1次元 ({explained_inertia[0]:.1%} の寄与率)", fontsize=14, labelpad=10
        )
        plt.ylabel(
            f"第2次元 ({explained_inertia[1]:.1%} の寄与率)", fontsize=14, labelpad=10
        )

        # 原点の軸線
        plt.axhline(y=0, color="gray", linestyle="--", alpha=0.5, zorder=0)
        plt.axvline(x=0, color="gray", linestyle="--", alpha=0.5, zorder=0)

        # グリッドスタイル
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
                # 点とラベルの位置
                x, y = row[dim1_col], row[dim2_col]
                label_x, label_y = row["label_x"], row["label_y"]

                # 距離が一定以上の場合のみ矢印を表示
                dist = np.sqrt((label_x - x) ** 2 + (label_y - y) ** 2)
                if dist > 0.05:
                    plt.annotate(
                        "",
                        xy=(x, y),  # 矢印の先（データポイント）
                        xytext=(label_x, label_y),  # 矢印の元（ラベル位置）
                        arrowprops=dict(
                            arrowstyle="-", color="gray", alpha=0.5, linewidth=0.5
                        ),
                        zorder=1,
                    )

                # テキストを境界線付きで表示
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
                    path_effects=[pe.withStroke(linewidth=3, foreground="white")],
                )

        # 凡例を追加
        legend = plt.legend(
            title="タイプ",
            fontsize=12,
            title_fontsize=13,
            loc="best",
            frameon=True,
            framealpha=0.9,
            edgecolor="gray",
        )
        legend.get_frame().set_linewidth(0.8)

        # 情報ボックスを追加
        total_inertia = sum(ca_results["explained_inertia"])
        info_text = f"総慣性: {total_inertia:.1%}\n"
        info_text += f"第1次元と第2次元で{sum(explained_inertia[:2]):.1%}の情報を説明"

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

        margin = 0.1  # 余白
        plt.xlim(x_min - margin * (x_max - x_min), x_max + margin * (x_max - x_min))
        plt.ylim(y_min - margin * (y_max - y_min), y_max + margin * (y_max - y_min))

        plt.tight_layout()

        # 画像をBase64エンコード
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
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        plt.close()

        return image_base64

    def optimize_label_positions(self, points, dim1_col, dim2_col):
        """ラベル位置を最適化"""
        # 初期位置を設定
        points["label_x"] = points[dim1_col]
        points["label_y"] = points[dim2_col]

        # 全ての点の座標
        coords = points[[dim1_col, dim2_col]].values

        try:
            # 点間の距離行列を計算
            dist_matrix = distance_matrix(coords, coords)
            np.fill_diagonal(dist_matrix, np.inf)  # 自分自身との距離を無限に

            # 各点の最も近い点との距離
            min_distances = np.min(dist_matrix, axis=1)

            # 平均的な点間距離
            avg_distance = np.median(min_distances)

            # 基本オフセット（平均距離の30%）
            base_offset = avg_distance * 0.3

            # 各点のラベル位置を最適化
            for i, (idx, row) in enumerate(points.iterrows()):
                x, y = row[dim1_col], row[dim2_col]

                # 点が密集している領域では大きなオフセットを使用
                neighbors = np.sum(dist_matrix[i] < avg_distance)
                density_factor = min(1.0 + (neighbors * 0.15), 2.0)

                # 原点からの相対位置に基づくオフセット方向
                angle = np.arctan2(y, x) if (x != 0 or y != 0) else 0

                # オフセット方向を決定論的に決定
                if abs(angle) <= np.pi / 4:  # 右
                    dx, dy = base_offset * density_factor, 0
                elif abs(angle) >= 3 * np.pi / 4:  # 左
                    dx, dy = -base_offset * density_factor, 0
                elif angle > 0:  # 上
                    dx, dy = 0, base_offset * density_factor
                else:  # 下
                    dx, dy = 0, -base_offset * density_factor

                # 最終的なラベル位置を設定
                points.at[idx, "label_x"] = x + dx
                points.at[idx, "label_y"] = y + dy

        except Exception as e:
            print(f"Label optimization warning: {e}")
            # エラーの場合は元の位置をそのまま使用
            pass

        return points


# グローバル分析インスタンス
analyzer = CorrespondenceAnalyzer()


@app.get("/")
async def root():
    """APIの基本情報を返す"""
    return {"message": "コレスポンデンス分析API", "version": "1.0.0"}


@app.post("/analyze")
async def analyze_correspondence(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: str = Query(None, description="分析の説明"),
    tags: str = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    db: Session = Depends(get_db),
):
    """CSVファイルをアップロードしてコレスポンデンス分析を実行し、結果をデータベースに保存"""
    try:
        # ファイルタイプをチェック
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイルを読み込み
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        df = pd.read_csv(io.StringIO(csv_text), index_col=0)

        # データの基本チェック
        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # コレスポンデンス分析を実行
        ca_results = analyzer.ca_with_prince(df)

        # プロットを作成
        plot_base64 = analyzer.create_plot(ca_results, df)

        # タグの処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # データベースに保存
        session_id = await save_analysis_to_db(
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            df=df,
            ca_results=ca_results,
            plot_base64=plot_base64,
        )

        # 結果を整理
        results = {
            "success": True,
            "session_id": session_id,
            "data": {
                "total_inertia": float(ca_results["total_inertia"]),
                "chi2": float(ca_results["chi2"]),
                "eigenvalues": [float(x) for x in ca_results["eigenvalues"]],
                "explained_inertia": [
                    float(x) for x in ca_results["explained_inertia"]
                ],
                "cumulative_inertia": [
                    float(x) for x in np.cumsum(ca_results["explained_inertia"])
                ],
                "degrees_of_freedom": (df.shape[0] - 1) * (df.shape[1] - 1),
                "plot_image": plot_base64,
            },
            "metadata": {
                "session_name": session_name,
                "filename": file.filename,
                "rows": df.shape[0],
                "columns": df.shape[1],
                "row_names": list(df.index),
                "column_names": list(df.columns),
            },
        }

        return JSONResponse(content=results)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"分析中にエラーが発生しました: {str(e)}"
        )


async def save_analysis_to_db(
    db: Session,
    session_name: str,
    description: Optional[str],
    tags: List[str],
    user_id: str,
    file: UploadFile,
    csv_text: str,
    df: pd.DataFrame,
    ca_results: Dict[str, Any],
    plot_base64: str,
) -> int:
    """分析結果をデータベースに保存"""

    # 1. 分析セッションを作成
    analysis_session = AnalysisSession(
        session_name=session_name,
        original_filename=file.filename,
        file_size=len(csv_text.encode("utf-8")),
        description=description,
        tags=tags,
        user_id=user_id,
        # 分析結果の統計情報
        total_inertia=float(ca_results["total_inertia"]),
        chi2_value=float(ca_results["chi2"]),
        degrees_of_freedom=(df.shape[0] - 1) * (df.shape[1] - 1),
        row_count=df.shape[0],
        column_count=df.shape[1],
        # 次元の寄与率
        dimension_1_contribution=float(ca_results["explained_inertia"][0]),
        dimension_2_contribution=(
            float(ca_results["explained_inertia"][1])
            if len(ca_results["explained_inertia"]) > 1
            else 0
        ),
        # 分析パラメータ
        analysis_parameters={"n_components": 2},
    )

    db.add(analysis_session)
    db.commit()
    db.refresh(analysis_session)
    session_id = analysis_session.id

    # 2. 元データを保存
    original_data = OriginalData(
        session_id=session_id,
        csv_data=csv_text,
        row_names=list(df.index),
        column_names=list(df.columns),
        data_matrix=df.to_dict("records"),
    )
    db.add(original_data)

    # 3. 座標データを保存
    row_coords = ca_results["row_coordinates"]
    col_coords = ca_results["column_coordinates"]

    # 行座標を保存
    for idx, row in row_coords.iterrows():
        dim_cols = [col for col in row_coords.columns][:2]
        coords = CoordinatesData(
            session_id=session_id,
            point_type="row",
            point_name=str(idx),
            dimension_1=float(row[dim_cols[0]]) if len(dim_cols) > 0 else 0,
            dimension_2=float(row[dim_cols[1]]) if len(dim_cols) > 1 else 0,
        )
        db.add(coords)

    # 列座標を保存
    for idx, row in col_coords.iterrows():
        dim_cols = [col for col in col_coords.columns][:2]
        coords = CoordinatesData(
            session_id=session_id,
            point_type="column",
            point_name=str(idx),
            dimension_1=float(row[dim_cols[0]]) if len(dim_cols) > 0 else 0,
            dimension_2=float(row[dim_cols[1]]) if len(dim_cols) > 1 else 0,
        )
        db.add(coords)

    # 4. 可視化データを保存
    image_data = base64.b64decode(plot_base64)
    visualization = VisualizationData(
        session_id=session_id,
        image_type="correspondence_plot",
        image_data=image_data,
        image_base64=plot_base64,
        image_size=len(image_data),
        width=1400,  # 想定サイズ
        height=1100,
    )
    db.add(visualization)

    # 5. 固有値データを保存
    for i, (eigenval, explained_inertia) in enumerate(
        zip(ca_results["eigenvalues"], ca_results["explained_inertia"])
    ):
        eigenvalue_data = EigenvalueData(
            session_id=session_id,
            dimension_number=i + 1,
            eigenvalue=float(eigenval),
            explained_inertia=float(explained_inertia),
            cumulative_inertia=float(sum(ca_results["explained_inertia"][: i + 1])),
        )
        db.add(eigenvalue_data)

    # 全ての変更をコミット
    db.commit()

    return session_id


@app.get("/sessions")
async def get_analysis_sessions(
    user_id: str = Query("default", description="ユーザーID"),
    search: str = Query(None, description="検索キーワード"),
    tags: str = Query(None, description="タグフィルター（カンマ区切り）"),
    limit: int = Query(20, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    db: Session = Depends(get_db),
):
    """保存された分析セッションの一覧を取得"""
    try:
        query = db.query(AnalysisSession).filter(AnalysisSession.user_id == user_id)

        # 検索キーワードでフィルター
        if search:
            query = query.filter(
                AnalysisSession.session_name.ilike(f"%{search}%")
                | AnalysisSession.description.ilike(f"%{search}%")
                | AnalysisSession.original_filename.ilike(f"%{search}%")
            )

        # タグでフィルター
        if tags:
            tag_list = [tag.strip() for tag in tags.split(",")]
            for tag in tag_list:
                query = query.filter(AnalysisSession.tags.any(tag))

        # 最新順でソート
        query = query.order_by(AnalysisSession.analysis_timestamp.desc())

        # ページネーション
        total = query.count()
        sessions = query.offset(offset).limit(limit).all()

        # レスポンス形式を整理
        results = []
        for session in sessions:
            results.append(
                {
                    "session_id": session.id,
                    "session_name": session.session_name,
                    "filename": session.original_filename,
                    "description": session.description,
                    "tags": session.tags or [],
                    "analysis_timestamp": session.analysis_timestamp.isoformat(),
                    "total_inertia": (
                        float(session.total_inertia) if session.total_inertia else None
                    ),
                    "dimension_1_contribution": (
                        float(session.dimension_1_contribution)
                        if session.dimension_1_contribution
                        else None
                    ),
                    "dimension_2_contribution": (
                        float(session.dimension_2_contribution)
                        if session.dimension_2_contribution
                        else None
                    ),
                    "row_count": session.row_count,
                    "column_count": session.column_count,
                }
            )

        return {
            "success": True,
            "data": results,
            "pagination": {
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_next": offset + limit < total,
            },
        }

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"データ取得中にエラーが発生しました: {str(e)}"
        )


@app.get("/sessions/{session_id}")
async def get_analysis_detail(session_id: int, db: Session = Depends(get_db)):
    """特定の分析セッションの詳細を取得"""
    try:
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        # 関連データを取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )
        eigenvalues = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .all()
        )
        visualization = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )

        # 座標データを整理
        row_coords = []
        col_coords = []
        for coord in coordinates:
            coord_data = {
                "name": coord.point_name,
                "dimension_1": float(coord.dimension_1) if coord.dimension_1 else 0,
                "dimension_2": float(coord.dimension_2) if coord.dimension_2 else 0,
            }
            if coord.point_type == "row":
                row_coords.append(coord_data)
            else:
                col_coords.append(coord_data)

        # 固有値データを整理
        eigenvalue_data = []
        for eigenval in sorted(eigenvalues, key=lambda x: x.dimension_number):
            eigenvalue_data.append(
                {
                    "dimension": eigenval.dimension_number,
                    "eigenvalue": (
                        float(eigenval.eigenvalue) if eigenval.eigenvalue else 0
                    ),
                    "explained_inertia": (
                        float(eigenval.explained_inertia)
                        if eigenval.explained_inertia
                        else 0
                    ),
                    "cumulative_inertia": (
                        float(eigenval.cumulative_inertia)
                        if eigenval.cumulative_inertia
                        else 0
                    ),
                }
            )

        # レスポンスを構築
        result = {
            "success": True,
            "session_info": {
                "session_id": session.id,
                "session_name": session.session_name,
                "filename": session.original_filename,
                "description": session.description,
                "tags": session.tags or [],
                "analysis_timestamp": session.analysis_timestamp.isoformat(),
                "user_id": session.user_id,
            },
            "analysis_data": {
                "total_inertia": (
                    float(session.total_inertia) if session.total_inertia else None
                ),
                "chi2": float(session.chi2_value) if session.chi2_value else None,
                "degrees_of_freedom": session.degrees_of_freedom,
                "dimensions_count": session.dimensions_count,
                "eigenvalues": eigenvalue_data,
                "coordinates": {"rows": row_coords, "columns": col_coords},
            },
            "metadata": {
                "row_count": session.row_count,
                "column_count": session.column_count,
                "file_size": session.file_size,
            },
            "visualization": {
                "plot_image": visualization.image_base64 if visualization else None,
                "image_info": (
                    {
                        "width": visualization.width if visualization else None,
                        "height": visualization.height if visualization else None,
                        "size_bytes": (
                            visualization.image_size if visualization else None
                        ),
                    }
                    if visualization
                    else None
                ),
            },
        }

        return result

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"データ取得中にエラーが発生しました: {str(e)}"
        )


@app.get("/sessions/{session_id}/csv")
async def download_original_csv(session_id: int, db: Session = Depends(get_db)):
    """分析に使用した元のCSVファイルをダウンロード"""
    try:
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        original_data = (
            db.query(OriginalData).filter(OriginalData.session_id == session_id).first()
        )
        if not original_data:
            raise HTTPException(status_code=404, detail="元データが見つかりません")

        # CSVファイルとしてレスポンス
        return Response(
            content=original_data.csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={session.original_filename}"
            },
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"ファイルダウンロード中にエラーが発生しました: {str(e)}",
        )


@app.get("/sessions/{session_id}/image")
async def download_plot_image(session_id: int, db: Session = Depends(get_db)):
    """分析結果のプロット画像をダウンロード"""
    try:
        visualization = (
            db.query(VisualizationData)
            .filter(VisualizationData.session_id == session_id)
            .first()
        )
        if not visualization:
            raise HTTPException(status_code=404, detail="画像データが見つかりません")

        # PNG画像としてレスポンス
        return Response(
            content=visualization.image_data,
            media_type="image/png",
            headers={
                "Content-Disposition": f"attachment; filename=analysis_{session_id}_plot.png"
            },
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"画像ダウンロード中にエラーが発生しました: {str(e)}",
        )


@app.delete("/sessions/{session_id}")
async def delete_analysis_session(session_id: int, db: Session = Depends(get_db)):
    """分析セッションを削除"""
    try:
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        # セッションを削除（カスケードで関連データも削除される）
        db.delete(session)
        db.commit()

        return {"success": True, "message": "セッションが削除されました"}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"削除中にエラーが発生しました: {str(e)}"
        )


@app.put("/sessions/{session_id}")
async def update_analysis_session(
    session_id: int,
    session_name: str = Query(None, description="新しいセッション名"),
    description: str = Query(None, description="新しい説明"),
    tags: str = Query(None, description="新しいタグ（カンマ区切り）"),
    db: Session = Depends(get_db),
):
    """分析セッションの情報を更新"""
    try:
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        # 更新可能なフィールドを更新
        if session_name is not None:
            session.session_name = session_name
        if description is not None:
            session.description = description
        if tags is not None:
            session.tags = [tag.strip() for tag in tags.split(",")] if tags else []

        session.updated_at = datetime.utcnow()

        db.commit()
        db.refresh(session)

        return {
            "success": True,
            "message": "セッションが更新されました",
            "session": {
                "session_id": session.id,
                "session_name": session.session_name,
                "description": session.description,
                "tags": session.tags or [],
                "updated_at": session.updated_at.isoformat(),
            },
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"更新中にエラーが発生しました: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """ヘルスチェック"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
