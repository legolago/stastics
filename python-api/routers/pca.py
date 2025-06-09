from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse, Response
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import io
import csv
from typing import Optional, List

from models import get_db
from analysis.pca import PCAAnalyzer

router = APIRouter(prefix="/pca", tags=["pca"])


@router.post("/analyze")
async def analyze_pca(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    n_components: int = Query(2, description="主成分数"),
    standardize: bool = Query(True, description="標準化の実行"),
    db: Session = Depends(get_db),
):
    """主成分分析を実行"""
    try:
        print(f"=== PCA API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"主成分数: {n_components}")
        print(f"標準化: {standardize}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = contents.decode("shift_jis")

        print(f"CSVテキスト:\n{csv_text}")

        df = pd.read_csv(io.StringIO(csv_text), index_col=0)
        print(f"データフレーム:\n{df}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 数値データのみを抽出
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            raise HTTPException(
                status_code=400,
                detail="数値データが見つかりません。主成分分析には数値データが必要です。",
            )

        # 欠損値の処理
        if numeric_df.isnull().any().any():
            numeric_df = numeric_df.dropna()
            if numeric_df.empty:
                raise HTTPException(
                    status_code=400,
                    detail="欠損値を除去した結果、データが空になりました。",
                )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行（BaseAnalyzerのパイプラインを使用）
        analyzer = PCAAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=numeric_df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            n_components=n_components,
            standardize=standardize,
        )

        print("=== PCA API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== PCA API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"PCA分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_pca_methods():
    """主成分分析で利用可能な手法一覧を取得"""
    return {
        "methods": [
            {
                "name": "standard",
                "display_name": "標準主成分分析",
                "description": "相関行列または共分散行列に基づく主成分分析",
                "parameters": {
                    "n_components": {
                        "type": "integer",
                        "default": 2,
                        "min": 2,
                        "max": 10,
                        "description": "抽出する主成分数",
                    },
                    "standardize": {
                        "type": "boolean",
                        "default": True,
                        "description": "データの標準化を行うか",
                    },
                },
            }
        ],
        "guidelines": {
            "kmo_thresholds": {
                "excellent": {"value": 0.9, "label": "優秀"},
                "good": {"value": 0.8, "label": "良好"},
                "adequate": {"value": 0.7, "label": "適切"},
                "poor": {"value": 0.6, "label": "不良"},
                "unacceptable": {"value": 0.5, "label": "不適切"},
            },
            "minimum_sample_size": "変数数の3倍以上推奨",
            "minimum_variables": 2,
            "eigenvalue_threshold": 1.0,
        },
    }


@router.get("/parameters/validate")
async def validate_pca_parameters(
    n_components: int = Query(2, description="主成分数"),
    standardize: bool = Query(True, description="標準化"),
):
    """パラメータの妥当性をチェック"""
    validation_result = {"valid": True, "warnings": [], "errors": []}

    if n_components < 1:
        validation_result["errors"].append("主成分数は1以上である必要があります")
        validation_result["valid"] = False
    elif n_components > 20:
        validation_result["warnings"].append(
            "主成分数が多すぎる可能性があります（推奨: ≤10）"
        )

    return validation_result


@router.get("/interpretation")
async def get_interpretation_guide():
    """主成分分析結果の解釈ガイドを取得"""
    return {
        "kmo_interpretation": {
            "description": "Kaiser-Meyer-Olkin適合度測度",
            "ranges": {
                "0.9以上": "優秀 - 主成分分析に非常に適している",
                "0.8-0.9": "良好 - 主成分分析に適している",
                "0.7-0.8": "適切 - 主成分分析が可能",
                "0.6-0.7": "不良 - 主成分分析には不適切",
                "0.6未満": "不適切 - 主成分分析は推奨されない",
            },
        },
        "explained_variance": {
            "description": "寄与率 - 各主成分が説明する分散の割合",
            "interpretation": {
                "Kaiser基準": "固有値1以上の主成分を採用",
                "累積寄与率": "70-80%以上で十分な説明力",
            },
        },
        "component_loadings": {
            "description": "主成分負荷量 - 変数と主成分の相関の強さ",
            "ranges": {
                "0.7以上": "強い関連",
                "0.5-0.7": "中程度の関連",
                "0.3-0.5": "弱い関連",
                "0.3未満": "ほとんど関連なし",
            },
        },
        "eigenvalue": {
            "description": "固有値 - 各主成分が説明する分散の大きさ",
            "interpretation": {
                "Kaiser基準": "固有値1以上の主成分を採用",
                "スクリー基準": "スクリープロットの急激な減少点まで採用",
            },
        },
    }


@router.get("/sessions/{session_id}")
async def get_pca_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
):
    """主成分分析セッション詳細を取得"""
    try:
        print(f"📊 主成分分析セッション詳細取得開始: {session_id}")

        # PCAAnalyzerのインスタンスを作成
        analyzer = PCAAnalyzer()

        # セッション詳細を取得
        session_detail = await analyzer.get_session_detail(session_id, db)

        print(f"🔍 取得されたセッション詳細: {session_detail.get('success', False)}")

        if not session_detail or not session_detail.get("success"):
            error_msg = (
                session_detail.get("error", f"セッション {session_id} が見つかりません")
                if session_detail
                else f"セッション {session_id} が見つかりません"
            )
            raise HTTPException(status_code=404, detail=error_msg)

        return JSONResponse(content=session_detail)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 主成分分析セッション詳細取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"セッション詳細の取得中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/details")
async def download_pca_details(session_id: int, db: Session = Depends(get_db)):
    """主成分分析結果詳細をCSV形式でダウンロード"""
    try:
        from models import (
            AnalysisSession,
            EigenvalueData,
            AnalysisMetadata,
            CoordinatesData,
        )

        print(f"Starting PCA details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "pca":
            raise HTTPException(
                status_code=400, detail="主成分分析のセッションではありません"
            )

        print(f"Session found: {session.session_name}")

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        # 座標データを取得
        coordinates_data = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        # 固有値データを取得
        eigenvalue_data = (
            db.query(EigenvalueData)
            .filter(EigenvalueData.session_id == session_id)
            .all()
        )

        print(
            f"Found {len(metadata_entries)} metadata entries, {len(coordinates_data)} coordinates, {len(eigenvalue_data)} eigenvalues"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "主成分分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["サンプル数", session.row_count])
        writer.writerow(["変数数", session.column_count])
        writer.writerow([])

        # 固有値と寄与率
        if eigenvalue_data:
            writer.writerow(["主成分の固有値と寄与率"])
            writer.writerow(["主成分", "固有値", "寄与率(%)", "累積寄与率(%)"])

            for eigenval in sorted(eigenvalue_data, key=lambda x: x.dimension_number):
                eigenvalue = eigenval.eigenvalue if eigenval.eigenvalue else 0
                explained_variance = (
                    eigenval.explained_inertia if eigenval.explained_inertia else 0
                )
                cumulative_variance = (
                    eigenval.cumulative_inertia if eigenval.cumulative_inertia else 0
                )

                writer.writerow(
                    [
                        f"PC{eigenval.dimension_number}",
                        f"{eigenvalue:.8f}",
                        f"{explained_variance*100:.2f}",
                        f"{cumulative_variance*100:.2f}",
                    ]
                )
            writer.writerow([])

        # 主成分負荷量（変数座標）
        variable_coords = [
            coord for coord in coordinates_data if coord.point_type == "variable"
        ]
        if variable_coords:
            writer.writerow(["主成分負荷量"])
            writer.writerow(["変数名", "PC1", "PC2", "PC3", "PC4"])
            for coord in variable_coords:
                writer.writerow(
                    [
                        coord.point_name,
                        f"{coord.dimension_1:.6f}" if coord.dimension_1 else "0.000000",
                        f"{coord.dimension_2:.6f}" if coord.dimension_2 else "0.000000",
                        f"{coord.dimension_3:.6f}" if coord.dimension_3 else "0.000000",
                        f"{coord.dimension_4:.6f}" if coord.dimension_4 else "0.000000",
                    ]
                )
            writer.writerow([])

        # 主成分得点（サンプル座標）
        sample_coords = [
            coord for coord in coordinates_data if coord.point_type == "observation"
        ]
        if sample_coords:
            writer.writerow(["主成分得点"])
            writer.writerow(["サンプル名", "PC1", "PC2", "PC3", "PC4"])
            for coord in sample_coords:
                writer.writerow(
                    [
                        coord.point_name,
                        f"{coord.dimension_1:.6f}" if coord.dimension_1 else "0.000000",
                        f"{coord.dimension_2:.6f}" if coord.dimension_2 else "0.000000",
                        f"{coord.dimension_3:.6f}" if coord.dimension_3 else "0.000000",
                        f"{coord.dimension_4:.6f}" if coord.dimension_4 else "0.000000",
                    ]
                )
            writer.writerow([])

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"pca_details_{session_id}.csv"

        # Responseを作成
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"詳細CSV出力エラー: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"詳細CSV出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/download/{session_id}/loadings")
async def download_pca_loadings(session_id: int, db: Session = Depends(get_db)):
    """主成分負荷量をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "pca":
            raise HTTPException(
                status_code=400, detail="主成分分析のセッションではありません"
            )

        # 変数座標データ（主成分負荷量）を取得
        loadings = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "variable",
            )
            .all()
        )

        if not loadings:
            raise HTTPException(status_code=404, detail="主成分負荷量が見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["variable_name", "PC1", "PC2", "PC3", "PC4"])

        # データ行
        for loading in loadings:
            writer.writerow(
                [
                    loading.point_name,
                    loading.dimension_1 if loading.dimension_1 is not None else 0.0,
                    loading.dimension_2 if loading.dimension_2 is not None else 0.0,
                    loading.dimension_3 if loading.dimension_3 is not None else 0.0,
                    loading.dimension_4 if loading.dimension_4 is not None else 0.0,
                ]
            )

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=pca_loadings_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"主成分負荷量CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"主成分負荷量CSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/scores")
async def download_pca_scores(session_id: int, db: Session = Depends(get_db)):
    """主成分得点をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "pca":
            raise HTTPException(
                status_code=400, detail="主成分分析のセッションではありません"
            )

        # サンプル座標データ（主成分得点）を取得
        scores = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "observation",
            )
            .all()
        )

        if not scores:
            raise HTTPException(status_code=404, detail="主成分得点が見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(["sample_name", "PC1", "PC2", "PC3", "PC4"])

        # データ行
        for score in scores:
            writer.writerow(
                [
                    score.point_name,
                    score.dimension_1 if score.dimension_1 is not None else 0.0,
                    score.dimension_2 if score.dimension_2 is not None else 0.0,
                    score.dimension_3 if score.dimension_3 is not None else 0.0,
                    score.dimension_4 if score.dimension_4 is not None else 0.0,
                ]
            )

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=pca_scores_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"主成分得点CSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"主成分得点CSV出力中にエラーが発生しました: {str(e)}",
        )
