from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import pandas as pd
import io
from typing import Optional, List

from models import get_db
from analysis.correspondence import CorrespondenceAnalyzer

router = APIRouter(prefix="/correspondence", tags=["correspondence"])


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

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        csv_text = contents.decode("utf-8")
        print(f"CSVテキスト:\n{csv_text}")

        df = pd.read_csv(io.StringIO(csv_text), index_col=0)
        print(f"データフレーム:\n{df}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行（BaseAnalyzerのパイプラインを使用）
        analyzer = CorrespondenceAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            n_components=n_components,
        )

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


# routers/correspondence.py に追加する関数


@router.get("/download/{session_id}/coordinates")
async def download_correspondence_coordinates(
    session_id: int, db: Session = Depends(get_db)
):
    """コレスポンデンス分析の座標データをCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "correspondence":
            raise HTTPException(
                status_code=400, detail="コレスポンデンス分析のセッションではありません"
            )

        # 座標データを取得
        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .all()
        )

        if not coordinates:
            raise HTTPException(status_code=404, detail="座標データが見つかりません")

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー
        writer.writerow(
            ["point_name", "point_type", "dimension_1", "dimension_2", "dimension_3"]
        )

        # データ行
        for coord in coordinates:
            writer.writerow(
                [
                    coord.point_name,
                    coord.point_type,
                    coord.dimension_1 if coord.dimension_1 is not None else 0.0,
                    coord.dimension_2 if coord.dimension_2 is not None else 0.0,
                    coord.dimension_3 if coord.dimension_3 is not None else 0.0,
                ]
            )

        output.seek(0)

        # レスポンス作成
        response = StreamingResponse(
            io.StringIO(output.getvalue()),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=correspondence_coordinates_{session_id}.csv"
            },
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        print(f"座標データCSV出力エラー: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"座標データCSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/details")
async def download_correspondence_details(
    session_id: int, db: Session = Depends(get_db)
):
    """コレスポンデンス分析結果詳細をCSV形式でダウンロード"""
    try:
        import csv
        import io
        from fastapi.responses import Response
        from models import (
            AnalysisSession,
            EigenvalueData,
            AnalysisMetadata,
            CoordinatesData,
        )

        print(f"Starting correspondence details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "correspondence":
            raise HTTPException(
                status_code=400, detail="コレスポンデンス分析のセッションではありません"
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
        writer.writerow(["分析手法", "コレスポンデンス分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["行数", session.row_count])
        writer.writerow(["列数", session.column_count])
        writer.writerow([])

        # 評価指標
        writer.writerow(["評価指標"])
        writer.writerow(["指標", "値"])

        # セッション情報から評価指標を取得
        chi2_value = getattr(session, "chi2_value", 0.0)
        p_value = getattr(session, "p_value", 0.0)
        total_inertia = getattr(session, "total_inertia", 0.0)

        writer.writerow(["カイ二乗統計量", f"{chi2_value:.4f}"])
        writer.writerow(["p値", f"{p_value:.4f}"])
        writer.writerow(["総慣性", f"{total_inertia:.4f}"])
        writer.writerow([])

        # 固有値と寄与率
        if eigenvalue_data:
            writer.writerow(["固有値と寄与率"])
            writer.writerow(["次元", "固有値", "寄与率(%)", "累積寄与率(%)"])

            for eigenval in sorted(eigenvalue_data, key=lambda x: x.dimension_number):
                eigenvalue = eigenval.eigenvalue if eigenval.eigenvalue else 0
                explained_inertia = (
                    eigenval.explained_inertia if eigenval.explained_inertia else 0
                )
                cumulative_inertia = (
                    eigenval.cumulative_inertia if eigenval.cumulative_inertia else 0
                )

                writer.writerow(
                    [
                        f"次元{eigenval.dimension_number}",
                        f"{eigenvalue:.8f}",
                        f"{explained_inertia*100:.2f}",
                        f"{cumulative_inertia*100:.2f}",
                    ]
                )
            writer.writerow([])

        # 座標データ
        if coordinates_data:
            # 行座標
            row_coords = [
                coord for coord in coordinates_data if coord.point_type == "row"
            ]
            if row_coords:
                writer.writerow(["行座標"])
                writer.writerow(["行名", "第1次元", "第2次元", "第3次元"])
                for coord in row_coords:
                    writer.writerow(
                        [
                            coord.point_name,
                            (
                                f"{coord.dimension_1:.6f}"
                                if coord.dimension_1
                                else "0.000000"
                            ),
                            (
                                f"{coord.dimension_2:.6f}"
                                if coord.dimension_2
                                else "0.000000"
                            ),
                            (
                                f"{coord.dimension_3:.6f}"
                                if coord.dimension_3
                                else "0.000000"
                            ),
                        ]
                    )
                writer.writerow([])

            # 列座標
            col_coords = [
                coord for coord in coordinates_data if coord.point_type == "column"
            ]
            if col_coords:
                writer.writerow(["列座標"])
                writer.writerow(["列名", "第1次元", "第2次元", "第3次元"])
                for coord in col_coords:
                    writer.writerow(
                        [
                            coord.point_name,
                            (
                                f"{coord.dimension_1:.6f}"
                                if coord.dimension_1
                                else "0.000000"
                            ),
                            (
                                f"{coord.dimension_2:.6f}"
                                if coord.dimension_2
                                else "0.000000"
                            ),
                            (
                                f"{coord.dimension_3:.6f}"
                                if coord.dimension_3
                                else "0.000000"
                            ),
                        ]
                    )
                writer.writerow([])

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"correspondence_details_{session_id}.csv"

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
