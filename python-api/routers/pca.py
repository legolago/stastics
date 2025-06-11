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


@router.get("/debug/sessions")
async def debug_pca_sessions(
    user_id: str = Query("default"), db: Session = Depends(get_db)
):
    """デバッグ用：PCAセッションの状態確認"""
    try:
        from models import AnalysisSession

        print(f"🔧 PCAセッションデバッグ開始: user_id='{user_id}'")

        # 全セッションを取得
        all_sessions = (
            db.query(AnalysisSession)
            .filter(AnalysisSession.user_id == user_id)
            .order_by(AnalysisSession.analysis_timestamp.desc())
            .limit(50)
            .all()
        )

        # 分析タイプ別集計
        type_counts = {}
        pca_sessions = []
        session_details = []

        for session in all_sessions:
            analysis_type = session.analysis_type or "null"
            type_counts[analysis_type] = type_counts.get(analysis_type, 0) + 1

            session_info = {
                "id": session.id,
                "name": session.session_name,
                "type": session.analysis_type,
                "filename": session.original_filename,
                "timestamp": (
                    session.analysis_timestamp.isoformat()
                    if session.analysis_timestamp
                    else None
                ),
                "row_count": session.row_count,
                "column_count": session.column_count,
            }
            session_details.append(session_info)

            # PCA関連セッションを抽出
            if analysis_type in ["pca", "PCA", "principal_component_analysis"]:
                pca_sessions.append(session_info)

        print(f"🔧 デバッグ結果:")
        print(f"  - 総セッション数: {len(all_sessions)}")
        print(f"  - PCAセッション数: {len(pca_sessions)}")
        print(f"  - 分析タイプ分布: {type_counts}")

        return {
            "success": True,
            "debug_info": {
                "user_id": user_id,
                "total_sessions": len(all_sessions),
                "pca_sessions_count": len(pca_sessions),
                "type_distribution": type_counts,
                "all_sessions": session_details,
                "pca_sessions_only": pca_sessions,
                "timestamp": datetime.now().isoformat(),
            },
            "recommendations": [
                f"PCAセッションが見つからない場合は、新しい分析を実行してください",
                f"analysis_typeが'pca'以外になっている場合は、データベースの保存処理に問題があります",
                f"総セッション数: {len(all_sessions)}, PCA: {len(pca_sessions)}",
            ],
        }

    except Exception as e:
        print(f"❌ PCAデバッグエラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"PCAデバッグ実行エラー: {str(e)}")


@router.post("/debug/fix-analysis-type")
async def fix_pca_analysis_type(
    user_id: str = Query("default"), db: Session = Depends(get_db)
):
    """デバッグ用：既存セッションのanalysis_typeを修正"""
    try:
        from models import AnalysisSession

        print(f"🔧 PCA analysis_type修正開始: user_id='{user_id}'")

        # PCA関連と思われるセッションを検索
        sessions_to_fix = (
            db.query(AnalysisSession)
            .filter(AnalysisSession.user_id == user_id)
            .filter(
                # analysis_typeがnullまたは空、もしくはセッション名にPCAが含まれる
                (AnalysisSession.analysis_type.is_(None))
                | (AnalysisSession.analysis_type == "")
                | (AnalysisSession.session_name.ilike("%pca%"))
                | (AnalysisSession.session_name.ilike("%主成分%"))
                | (AnalysisSession.original_filename.ilike("%pca%"))
            )
            .all()
        )

        fixed_count = 0
        for session in sessions_to_fix:
            old_type = session.analysis_type
            session.analysis_type = "pca"  # 強制的にPCAに設定
            fixed_count += 1
            print(f"  修正: Session {session.id}: '{old_type}' → 'pca'")

        if fixed_count > 0:
            db.commit()
            print(f"✅ {fixed_count}件のanalysis_typeを修正しました")
        else:
            print(f"修正対象のセッションはありませんでした")

        return {
            "success": True,
            "fixed_count": fixed_count,
            "message": f"{fixed_count}件のセッションのanalysis_typeを'pca'に修正しました",
            "details": [
                {
                    "id": session.id,
                    "name": session.session_name,
                    "old_type": None,  # 修正前の値は記録していない
                    "new_type": "pca",
                }
                for session in sessions_to_fix
            ],
        }

    except Exception as e:
        print(f"❌ PCA analysis_type修正エラー: {str(e)}")
        db.rollback()
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"analysis_type修正エラー: {str(e)}"
        )


# routers/pca.py の最後に以下のエンドポイントを追加（PCA履歴専用エンドポイント含む）


@router.get("/sessions")
async def get_pca_sessions_list(
    user_id: str = Query("default", description="ユーザーID"),
    limit: int = Query(50, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    db: Session = Depends(get_db),
):
    """PCA分析セッションの一覧を取得（analysis_type='pca'でフィルタリング）"""
    try:
        from models import AnalysisSession

        print(
            f"📊 PCA専用セッション一覧取得: user_id='{user_id}', limit={limit}, offset={offset}"
        )

        # PCAセッションのみを取得（analysis_type='pca'でフィルタリング）
        query = (
            db.query(AnalysisSession)
            .filter(
                AnalysisSession.user_id == user_id,
                AnalysisSession.analysis_type == "pca",
            )
            .order_by(AnalysisSession.analysis_timestamp.desc())
        )

        # 総数を取得
        total_count = query.count()
        print(f"🔢 PCAセッション総数: {total_count}")

        # ページネーション適用
        sessions = query.offset(offset).limit(limit).all()
        print(f"📄 取得したPCAセッション数: {len(sessions)}")

        # セッションデータを整形
        session_list = []
        for session in sessions:
            # タグを安全に取得（テーブル構造に依存しない方法）
            tag_names = []
            try:
                # 複数のパターンでタグテーブルを試行
                tag_queries = [
                    # パターン1: SessionTag.tag_name
                    lambda: db.execute(
                        "SELECT tag_name FROM session_tags WHERE session_id = :session_id",
                        {"session_id": session.id},
                    ).fetchall(),
                    # パターン2: SessionTag.name
                    lambda: db.execute(
                        "SELECT name FROM session_tags WHERE session_id = :session_id",
                        {"session_id": session.id},
                    ).fetchall(),
                    # パターン3: tags テーブル
                    lambda: db.execute(
                        "SELECT tag FROM tags WHERE session_id = :session_id",
                        {"session_id": session.id},
                    ).fetchall(),
                ]

                for query_func in tag_queries:
                    try:
                        tag_rows = query_func()
                        tag_names = [row[0] for row in tag_rows if row[0]]
                        if tag_names:  # タグが見つかったら終了
                            break
                    except Exception as tag_error:
                        continue  # 次のパターンを試行

            except Exception as e:
                print(f"⚠️ タグ取得エラー (session {session.id}): {e}")
                tag_names = []  # エラーの場合は空リスト

            session_data = {
                "id": session.id,
                "session_id": session.id,  # 互換性のため
                "session_name": session.session_name,
                "description": session.description or "",
                "analysis_type": session.analysis_type,
                "filename": session.original_filename or session.filename,
                "original_filename": session.original_filename or session.filename,
                "row_count": session.row_count,
                "column_count": session.column_count,
                "analysis_timestamp": (
                    session.analysis_timestamp.isoformat()
                    if session.analysis_timestamp
                    else None
                ),
                "user_id": session.user_id,
                "tags": tag_names,
                # PCA特有の情報
                "dimensions_count": getattr(session, "dimensions_count", 2),
                "dimension_1_contribution": (
                    float(session.dimension_1_contribution)
                    if getattr(session, "dimension_1_contribution", None) is not None
                    else 0.0
                ),
                "dimension_2_contribution": (
                    float(session.dimension_2_contribution)
                    if getattr(session, "dimension_2_contribution", None) is not None
                    else 0.0
                ),
                "standardized": getattr(session, "standardized", True),
                "kmo": (
                    float(session.chi2_value)
                    if getattr(session, "chi2_value", None) is not None
                    else 0.0
                ),
                "chi2_value": (
                    float(session.chi2_value)
                    if getattr(session, "chi2_value", None) is not None
                    else 0.0
                ),
            }
            session_list.append(session_data)

        print(f"✅ PCA専用セッション一覧取得完了: {len(session_list)}件")

        return JSONResponse(
            content={
                "success": True,
                "data": session_list,
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(session_list) < total_count,
            }
        )

    except Exception as e:
        print(f"❌ PCA専用セッション一覧取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"PCAセッション一覧取得エラー: {str(e)}"
        )


@router.get("/sessions-simple")
async def get_pca_sessions_simple(
    user_id: str = Query("default", description="ユーザーID"),
    limit: int = Query(50, description="取得件数"),
    offset: int = Query(0, description="オフセット"),
    db: Session = Depends(get_db),
):
    """PCA分析セッションの一覧を取得（タグなし・シンプル版）"""
    try:
        from models import AnalysisSession

        print(f"📊 PCA専用セッション一覧取得（シンプル版）: user_id='{user_id}'")

        # PCAセッションのみを取得（analysis_type='pca'でフィルタリング）
        query = (
            db.query(AnalysisSession)
            .filter(
                AnalysisSession.user_id == user_id,
                AnalysisSession.analysis_type == "pca",
            )
            .order_by(AnalysisSession.analysis_timestamp.desc())
        )

        # 総数を取得
        total_count = query.count()
        print(f"🔢 PCAセッション総数: {total_count}")

        # ページネーション適用
        sessions = query.offset(offset).limit(limit).all()
        print(f"📄 取得したPCAセッション数: {len(sessions)}")

        # セッションデータを整形（タグなし）
        session_list = []
        for session in sessions:
            session_data = {
                "id": session.id,
                "session_id": session.id,  # 互換性のため
                "session_name": session.session_name,
                "description": session.description or "",
                "analysis_type": session.analysis_type,
                "filename": session.original_filename or session.filename,
                "original_filename": session.original_filename or session.filename,
                "row_count": session.row_count,
                "column_count": session.column_count,
                "analysis_timestamp": (
                    session.analysis_timestamp.isoformat()
                    if session.analysis_timestamp
                    else None
                ),
                "user_id": session.user_id,
                "tags": [],  # タグは空配列で固定
                # PCA特有の情報
                "dimensions_count": getattr(session, "dimensions_count", 2),
                "dimension_1_contribution": (
                    float(session.dimension_1_contribution)
                    if getattr(session, "dimension_1_contribution", None) is not None
                    else 0.0
                ),
                "dimension_2_contribution": (
                    float(session.dimension_2_contribution)
                    if getattr(session, "dimension_2_contribution", None) is not None
                    else 0.0
                ),
                "standardized": getattr(session, "standardized", True),
                "kmo": (
                    float(session.chi2_value)
                    if getattr(session, "chi2_value", None) is not None
                    else 0.0
                ),
                "chi2_value": (
                    float(session.chi2_value)
                    if getattr(session, "chi2_value", None) is not None
                    else 0.0
                ),
            }
            session_list.append(session_data)

        print(f"✅ PCA専用セッション一覧取得完了（シンプル版）: {len(session_list)}件")

        return JSONResponse(
            content={
                "success": True,
                "data": session_list,
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(session_list) < total_count,
            }
        )

    except Exception as e:
        print(f"❌ PCA専用セッション一覧取得エラー（シンプル版）: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"PCAセッション一覧取得エラー（シンプル版）: {str(e)}",
        )


@router.get("/debug/sessions")
async def debug_pca_sessions(
    user_id: str = Query("default"), db: Session = Depends(get_db)
):
    """デバッグ用：PCAセッションの状態確認"""
    try:
        from models import AnalysisSession

        print(f"🔧 PCAセッションデバッグ開始: user_id='{user_id}'")

        # 全セッションを取得
        all_sessions = (
            db.query(AnalysisSession)
            .filter(AnalysisSession.user_id == user_id)
            .order_by(AnalysisSession.analysis_timestamp.desc())
            .limit(50)
            .all()
        )

        # 分析タイプ別集計
        type_counts = {}
        pca_sessions = []
        session_details = []

        for session in all_sessions:
            analysis_type = session.analysis_type or "null"
            type_counts[analysis_type] = type_counts.get(analysis_type, 0) + 1

            session_info = {
                "id": session.id,
                "name": session.session_name,
                "type": session.analysis_type,
                "filename": session.original_filename,
                "timestamp": (
                    session.analysis_timestamp.isoformat()
                    if session.analysis_timestamp
                    else None
                ),
                "row_count": session.row_count,
                "column_count": session.column_count,
            }
            session_details.append(session_info)

            # PCA関連セッションを抽出
            if analysis_type in ["pca", "PCA", "principal_component_analysis"]:
                pca_sessions.append(session_info)

        print(f"🔧 デバッグ結果:")
        print(f"  - 総セッション数: {len(all_sessions)}")
        print(f"  - PCAセッション数: {len(pca_sessions)}")
        print(f"  - 分析タイプ分布: {type_counts}")

        return {
            "success": True,
            "debug_info": {
                "user_id": user_id,
                "total_sessions": len(all_sessions),
                "pca_sessions_count": len(pca_sessions),
                "type_distribution": type_counts,
                "all_sessions": session_details,
                "pca_sessions_only": pca_sessions,
                "timestamp": datetime.now().isoformat(),
            },
            "recommendations": [
                f"PCAセッションが見つからない場合は、新しい分析を実行してください",
                f"analysis_typeが'pca'以外になっている場合は、データベースの保存処理に問題があります",
                f"総セッション数: {len(all_sessions)}, PCA: {len(pca_sessions)}",
            ],
        }

    except Exception as e:
        print(f"❌ PCAデバッグエラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"PCAデバッグ実行エラー: {str(e)}")


@router.post("/debug/fix-analysis-type")
async def fix_pca_analysis_type(
    user_id: str = Query("default"), db: Session = Depends(get_db)
):
    """デバッグ用：既存セッションのanalysis_typeを修正"""
    try:
        from models import AnalysisSession

        print(f"🔧 PCA analysis_type修正開始: user_id='{user_id}'")

        # PCA関連と思われるセッションを検索
        sessions_to_fix = (
            db.query(AnalysisSession)
            .filter(AnalysisSession.user_id == user_id)
            .filter(
                # analysis_typeがnullまたは空、もしくはセッション名にPCAが含まれる
                (AnalysisSession.analysis_type.is_(None))
                | (AnalysisSession.analysis_type == "")
                | (AnalysisSession.session_name.ilike("%pca%"))
                | (AnalysisSession.session_name.ilike("%主成分%"))
                | (AnalysisSession.original_filename.ilike("%pca%"))
            )
            .all()
        )

        fixed_count = 0
        for session in sessions_to_fix:
            old_type = session.analysis_type
            session.analysis_type = "pca"  # 強制的にPCAに設定
            fixed_count += 1
            print(f"  修正: Session {session.id}: '{old_type}' → 'pca'")

        if fixed_count > 0:
            db.commit()
            print(f"✅ {fixed_count}件のanalysis_typeを修正しました")
        else:
            print(f"修正対象のセッションはありませんでした")

        return {
            "success": True,
            "fixed_count": fixed_count,
            "message": f"{fixed_count}件のセッションのanalysis_typeを'pca'に修正しました",
            "details": [
                {
                    "id": session.id,
                    "name": session.session_name,
                    "old_type": None,  # 修正前の値は記録していない
                    "new_type": "pca",
                }
                for session in sessions_to_fix
            ],
        }

    except Exception as e:
        print(f"❌ PCA analysis_type修正エラー: {str(e)}")
        db.rollback()
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"analysis_type修正エラー: {str(e)}"
        )


@router.post("/debug/fix-analysis-type")
async def fix_pca_analysis_type(
    user_id: str = Query("default"), db: Session = Depends(get_db)
):
    """デバッグ用：既存セッションのanalysis_typeを修正"""
    try:
        from models import AnalysisSession

        print(f"🔧 PCA analysis_type修正開始: user_id='{user_id}'")

        # PCA関連と思われるセッションを検索
        sessions_to_fix = (
            db.query(AnalysisSession)
            .filter(AnalysisSession.user_id == user_id)
            .filter(
                # analysis_typeがnullまたは空、もしくはセッション名にPCAが含まれる
                (AnalysisSession.analysis_type.is_(None))
                | (AnalysisSession.analysis_type == "")
                | (AnalysisSession.session_name.ilike("%pca%"))
                | (AnalysisSession.session_name.ilike("%主成分%"))
                | (AnalysisSession.original_filename.ilike("%pca%"))
            )
            .all()
        )

        fixed_count = 0
        for session in sessions_to_fix:
            old_type = session.analysis_type
            session.analysis_type = "pca"  # 強制的にPCAに設定
            fixed_count += 1
            print(f"  修正: Session {session.id}: '{old_type}' → 'pca'")

        if fixed_count > 0:
            db.commit()
            print(f"✅ {fixed_count}件のanalysis_typeを修正しました")
        else:
            print(f"修正対象のセッションはありませんでした")

        return {
            "success": True,
            "fixed_count": fixed_count,
            "message": f"{fixed_count}件のセッションのanalysis_typeを'pca'に修正しました",
            "details": [
                {
                    "id": session.id,
                    "name": session.session_name,
                    "old_type": None,  # 修正前の値は記録していない
                    "new_type": "pca",
                }
                for session in sessions_to_fix
            ],
        }

    except Exception as e:
        print(f"❌ PCA analysis_type修正エラー: {str(e)}")
        db.rollback()
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"analysis_type修正エラー: {str(e)}"
        )
