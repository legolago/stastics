from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse, Response
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import io
import csv
from typing import Optional, List
from datetime import datetime

from models import get_db
from analysis.rfm import RFMAnalysisAnalyzer

router = APIRouter(prefix="/rfm", tags=["rfm"])


@router.post("/analyze")
async def analyze_rfm(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    customer_id_col: str = Query("id", description="顧客ID列名"),
    date_col: str = Query("date", description="日付列名"),
    amount_col: str = Query("price", description="金額列名"),
    analysis_date: Optional[str] = Query(None, description="分析基準日 (YYYY-MM-DD)"),
    rfm_divisions: int = Query(3, description="RFM分割数", ge=3, le=5),
    use_monetary_4_divisions: bool = Query(False, description="Monetaryを4分割するか"),
    db: Session = Depends(get_db),
):
    """RFM分析を実行"""
    try:
        print(f"=== RFM分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"顧客ID列: {customer_id_col}, 日付列: {date_col}, 金額列: {amount_col}")
        print(f"分析基準日: {analysis_date}, RFM分割数: {rfm_divisions}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み
        contents = await file.read()
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            try:
                csv_text = contents.decode("shift_jis")
            except UnicodeDecodeError:
                csv_text = contents.decode("iso-8859-1")

        print(f"CSVテキスト（最初の500文字）:\n{csv_text[:500]}")

        # CSVをDataFrameに変換
        df = pd.read_csv(io.StringIO(csv_text))
        print(f"データフレーム:\n{df.head()}")
        print(f"列名: {list(df.columns)}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 必要な列の存在確認
        required_cols = [customer_id_col, date_col, amount_col]
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400,
                detail=f"必要な列が見つかりません: {missing_cols}. 利用可能な列: {list(df.columns)}",
            )

        # 分析基準日の検証
        if analysis_date:
            try:
                datetime.strptime(analysis_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="分析基準日の形式が正しくありません。YYYY-MM-DD形式で入力してください。",
                )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行
        analyzer = RFMAnalysisAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            customer_id_col=customer_id_col,
            date_col=date_col,
            amount_col=amount_col,
            analysis_date=analysis_date,
            rfm_divisions=rfm_divisions,
            use_monetary_4_divisions=use_monetary_4_divisions,
        )

        print("=== RFM分析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== RFM分析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"RFM分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_rfm_methods():
    """RFM分析で利用可能な手法一覧を取得"""
    methods = {
        "rfm_divisions": [
            {
                "value": 3,
                "name": "3分割",
                "description": "低・中・高の3段階でRFM値を分割",
            },
            {
                "value": 4,
                "name": "4分割",
                "description": "より細かい4段階でRFM値を分割",
            },
            {
                "value": 5,
                "name": "5分割",
                "description": "最も細かい5段階でRFM値を分割",
            },
        ],
        "segment_definitions": {
            "VIP顧客": "最近購入し、頻繁に購入し、高額な顧客",
            "優良顧客": "最近購入し、適度に購入し、ある程度の金額を使う顧客",
            "新規顧客": "最近購入したが、まだ頻度や金額が少ない顧客",
            "要注意ヘビーユーザー": "購入頻度・金額は高いが、最近購入していない顧客",
            "安定顧客": "定期的に購入している顧客",
            "見込み顧客": "ポテンシャルがある顧客",
            "離脱した優良顧客": "過去は優良だったが、最近購入していない顧客",
            "離脱しつつある顧客": "購入が減っている顧客",
            "離脱顧客": "購入しなくなった顧客",
        },
        "required_columns": {
            "customer_id": "顧客を識別するための列（例: id, customer_id）",
            "date": "購入日付の列（例: date, purchase_date）",
            "amount": "購入金額の列（例: price, amount, total）",
        },
        "guidelines": {
            "minimum_data_period": "最低3ヶ月間のデータを推奨",
            "minimum_customers": "最低50人の顧客データを推奨",
            "date_format": "日付は YYYY-MM-DD, YYYY/MM/DD などの形式に対応",
            "analysis_date": "分析基準日を指定しない場合は、データの最終日の翌日を使用",
        },
    }

    return methods


@router.get("/parameters/validate")
async def validate_rfm_parameters(
    customer_id_col: str = Query("id", description="顧客ID列名"),
    date_col: str = Query("date", description="日付列名"),
    amount_col: str = Query("price", description="金額列名"),
    analysis_date: Optional[str] = Query(None, description="分析基準日"),
    rfm_divisions: int = Query(3, description="RFM分割数"),
):
    """RFM分析パラメータの検証"""
    validation_result = {"valid": True, "warnings": [], "errors": []}

    # 列名の検証
    if not customer_id_col.strip():
        validation_result["errors"].append("顧客ID列名は必須です")
        validation_result["valid"] = False

    if not date_col.strip():
        validation_result["errors"].append("日付列名は必須です")
        validation_result["valid"] = False

    if not amount_col.strip():
        validation_result["errors"].append("金額列名は必須です")
        validation_result["valid"] = False

    # 分析基準日の検証
    if analysis_date:
        try:
            datetime.strptime(analysis_date, "%Y-%m-%d")
        except ValueError:
            validation_result["errors"].append(
                "分析基準日の形式が正しくありません。YYYY-MM-DD形式で入力してください。"
            )
            validation_result["valid"] = False

    # RFM分割数の検証
    if rfm_divisions < 3:
        validation_result["errors"].append("RFM分割数は3以上である必要があります")
        validation_result["valid"] = False
    elif rfm_divisions > 5:
        validation_result["warnings"].append(
            "RFM分割数が多すぎる可能性があります（推奨: 3-5）"
        )

    return validation_result


@router.get("/interpretation")
async def get_interpretation_guide():
    """RFM分析結果の解釈ガイドを取得"""
    return {
        "rfm_metrics": {
            "recency": {
                "description": "最終購入からの経過日数",
                "interpretation": "値が小さいほど良い（最近購入している）",
            },
            "frequency": {
                "description": "購入回数",
                "interpretation": "値が大きいほど良い（頻繁に購入している）",
            },
            "monetary": {
                "description": "購入金額合計",
                "interpretation": "値が大きいほど良い（多く購入している）",
            },
        },
        "segments": {
            "VIP顧客": {
                "characteristics": "R=高, F=高, M=高",
                "action": "関係維持、プレミアムサービス提供",
            },
            "優良顧客": {
                "characteristics": "R=高, F=中-高, M=中-高",
                "action": "アップセル、クロスセル",
            },
            "新規顧客": {
                "characteristics": "R=高, F=低, M=低",
                "action": "オンボーディング、リテンション強化",
            },
            "要注意ヘビーユーザー": {
                "characteristics": "R=低, F=高, M=高",
                "action": "緊急リテンション施策",
            },
            "安定顧客": {
                "characteristics": "R=中, F=中, M=中",
                "action": "定期的なコミュニケーション",
            },
            "離脱顧客": {
                "characteristics": "R=低, F=低, M=低",
                "action": "ウィンバック施策",
            },
        },
        "score_interpretation": {
            "high_scores": "9以上: 最優良顧客",
            "medium_scores": "6-8: 一般顧客",
            "low_scores": "3-5: 要改善顧客",
        },
    }


@router.get("/sessions/{session_id}")
async def get_rfm_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
):
    """RFM分析セッション詳細を取得"""
    try:
        print(f"📊 RFM分析セッション詳細取得開始: {session_id}")

        # RFMAnalysisAnalyzerのインスタンスを作成
        analyzer = RFMAnalysisAnalyzer()

        # セッション詳細を取得
        session_detail = await analyzer.get_session_detail_async(session_id, db)

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
        print(f"❌ RFM分析セッション詳細取得エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"セッション詳細の取得中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/details")
async def download_rfm_details(session_id: int, db: Session = Depends(get_db)):
    """RFM分析結果詳細をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, AnalysisMetadata, CoordinatesData

        print(f"Starting RFM details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "rfm":
            raise HTTPException(
                status_code=400, detail="RFM分析のセッションではありません"
            )

        print(f"Session found: {session.session_name}")

        # 顧客データを取得
        customer_data = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .all()
        )

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        print(
            f"Found {len(customer_data)} customers, {len(metadata_entries)} metadata entries"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "RFM分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["データ行数", session.row_count])
        writer.writerow(["総顧客数", len(customer_data)])
        writer.writerow([])

        # RFM統計情報
        rfm_stats = None
        for meta in metadata_entries:
            if meta.metadata_type == "rfm_statistics":
                rfm_stats = meta.metadata_content
                break

        if rfm_stats:
            writer.writerow(["RFM統計情報"])

            # Recency統計
            writer.writerow(["Recency統計"])
            writer.writerow(["項目", "値"])
            r_stats = rfm_stats.get("rfm_stats", {}).get("recency", {})
            writer.writerow(["平均", f"{r_stats.get('mean', 0):.2f}"])
            writer.writerow(["標準偏差", f"{r_stats.get('std', 0):.2f}"])
            writer.writerow(["最小値", f"{r_stats.get('min', 0):.2f}"])
            writer.writerow(["最大値", f"{r_stats.get('max', 0):.2f}"])
            writer.writerow([])

            # Frequency統計
            writer.writerow(["Frequency統計"])
            writer.writerow(["項目", "値"])
            f_stats = rfm_stats.get("rfm_stats", {}).get("frequency", {})
            writer.writerow(["平均", f"{f_stats.get('mean', 0):.2f}"])
            writer.writerow(["標準偏差", f"{f_stats.get('std', 0):.2f}"])
            writer.writerow(["最小値", f"{f_stats.get('min', 0):.2f}"])
            writer.writerow(["最大値", f"{f_stats.get('max', 0):.2f}"])
            writer.writerow([])

            # Monetary統計
            writer.writerow(["Monetary統計"])
            writer.writerow(["項目", "値"])
            m_stats = rfm_stats.get("rfm_stats", {}).get("monetary", {})
            writer.writerow(["平均", f"{m_stats.get('mean', 0):.2f}"])
            writer.writerow(["標準偏差", f"{m_stats.get('std', 0):.2f}"])
            writer.writerow(["最小値", f"{m_stats.get('min', 0):.2f}"])
            writer.writerow(["最大値", f"{m_stats.get('max', 0):.2f}"])
            writer.writerow([])

            # セグメント分布
            segment_counts = rfm_stats.get("segment_counts", {})
            if segment_counts:
                writer.writerow(["セグメント分布"])
                writer.writerow(["セグメント", "顧客数", "割合(%)"])
                total_customers = sum(segment_counts.values())
                for segment, count in segment_counts.items():
                    percentage = (
                        (count / total_customers * 100) if total_customers > 0 else 0
                    )
                    writer.writerow([segment, count, f"{percentage:.1f}"])
                writer.writerow([])

        # 顧客詳細データ
        writer.writerow(["顧客詳細データ"])
        writer.writerow(
            [
                "顧客ID",
                "Recency",
                "Frequency",
                "Monetary",
                "RFMスコア",
                "Rスコア",
                "Fスコア",
                "Mスコア",
                "セグメント",
            ]
        )

        for customer in customer_data:
            metadata = customer.metadata_json or {}
            writer.writerow(
                [
                    customer.point_name,
                    f"{customer.dimension_1:.2f}" if customer.dimension_1 else "0.00",
                    f"{customer.dimension_2:.2f}" if customer.dimension_2 else "0.00",
                    f"{customer.dimension_3:.2f}" if customer.dimension_3 else "0.00",
                    f"{customer.dimension_4:.2f}" if customer.dimension_4 else "0.00",
                    metadata.get("r_score", ""),
                    metadata.get("f_score", ""),
                    metadata.get("m_score", ""),
                    metadata.get("segment", ""),
                ]
            )

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"rfm_details_{session_id}.csv"

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


@router.get("/download/{session_id}/customers")
async def download_rfm_customers(session_id: int, db: Session = Depends(get_db)):
    """顧客RFMデータをCSV形式でダウンロード（改善版）"""
    try:
        from models import AnalysisSession, CoordinatesData
        import pandas as pd

        print(f"=== 顧客データダウンロード開始: セッション {session_id} ===")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )

        if not session:
            print(f"❌ セッション {session_id} が見つかりません")
            raise HTTPException(
                status_code=404, detail=f"セッション {session_id} が見つかりません"
            )

        if session.analysis_type != "rfm":
            print(f"❌ 分析タイプが違います: {session.analysis_type}")
            raise HTTPException(
                status_code=400,
                detail=f"RFM分析のセッションではありません: {session.analysis_type}",
            )

        print(f"✅ セッション確認: {session.session_name}")

        # 顧客データを取得
        customers = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .order_by(CoordinatesData.point_name)
            .all()
        )

        print(f"取得した顧客データ数: {len(customers)}")

        if not customers:
            print("❌ 顧客データが見つかりません")

            # デバッグ情報
            all_data = (
                db.query(CoordinatesData)
                .filter(CoordinatesData.session_id == session_id)
                .all()
            )
            print(f"セッション {session_id} の全データ数: {len(all_data)}")
            for data in all_data[:5]:  # 最初の5件を表示
                print(f"  - {data.point_name} ({data.point_type})")

            raise HTTPException(
                status_code=404,
                detail=f"顧客データが見つかりません。セッション {session_id} には {len(all_data)} 件のデータがありますが、顧客データはありません。",
            )

        # Pandasを使用してCSV作成
        data_list = []
        for customer in customers:
            metadata = customer.metadata_json or {}
            data_list.append(
                {
                    "customer_id": customer.point_name,
                    "recency": (
                        customer.dimension_1
                        if customer.dimension_1 is not None
                        else 0.0
                    ),
                    "frequency": (
                        customer.dimension_2
                        if customer.dimension_2 is not None
                        else 0.0
                    ),
                    "monetary": (
                        customer.dimension_3
                        if customer.dimension_3 is not None
                        else 0.0
                    ),
                    "rfm_score": (
                        customer.dimension_4
                        if customer.dimension_4 is not None
                        else 0.0
                    ),
                    "r_score": metadata.get("r_score", ""),
                    "f_score": metadata.get("f_score", ""),
                    "m_score": metadata.get("m_score", ""),
                    "segment": metadata.get("segment", ""),
                }
            )

        # DataFrameに変換してCSV出力
        df = pd.DataFrame(data_list)

        # CSV文字列として出力
        csv_content = df.to_csv(index=False, encoding="utf-8")
        print(f"CSV生成完了: {len(csv_content)} 文字, {len(df)} 行")

        # ファイル名設定
        filename = f"rfm_customers_{session_id}.csv"

        # BOM付きUTF-8でエンコード
        csv_bytes = csv_content.encode("utf-8-sig")

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/csv; charset=utf-8",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 顧客データCSV出力エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"顧客データCSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/segments")
async def download_rfm_segments(session_id: int, db: Session = Depends(get_db)):
    """セグメント別統計をCSV形式でダウンロード（改善版）"""
    try:
        from models import AnalysisSession, CoordinatesData
        import pandas as pd

        print(f"=== セグメント統計ダウンロード開始: セッション {session_id} ===")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )

        if not session:
            raise HTTPException(
                status_code=404, detail=f"セッション {session_id} が見つかりません"
            )

        if session.analysis_type != "rfm":
            raise HTTPException(
                status_code=400,
                detail=f"RFM分析のセッションではありません: {session.analysis_type}",
            )

        # 顧客データを取得
        customers = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .all()
        )

        if not customers:
            raise HTTPException(status_code=404, detail="顧客データが見つかりません")

        # DataFrameに変換
        data_list = []
        for customer in customers:
            metadata = customer.metadata_json or {}
            data_list.append(
                {
                    "customer_id": customer.point_name,
                    "recency": customer.dimension_1 or 0,
                    "frequency": customer.dimension_2 or 0,
                    "monetary": customer.dimension_3 or 0,
                    "rfm_score": customer.dimension_4 or 0,
                    "segment": metadata.get("segment", "不明"),
                }
            )

        df = pd.DataFrame(data_list)

        # セグメント別統計を計算
        segment_stats = (
            df.groupby("segment")
            .agg(
                {
                    "customer_id": "count",
                    "recency": "mean",
                    "frequency": "mean",
                    "monetary": "mean",
                    "rfm_score": "mean",
                }
            )
            .round(2)
        )

        # パーセンテージを追加
        total_customers = len(df)
        segment_stats["percentage"] = (
            segment_stats["customer_id"] / total_customers * 100
        ).round(1)

        # 列名を日本語に変更
        segment_stats.columns = [
            "customer_count",
            "avg_recency",
            "avg_frequency",
            "avg_monetary",
            "avg_rfm_score",
            "percentage",
        ]

        # インデックスを列に変換
        segment_stats = segment_stats.reset_index()
        segment_stats.columns = [
            "segment",
            "customer_count",
            "avg_recency",
            "avg_frequency",
            "avg_monetary",
            "avg_rfm_score",
            "percentage",
        ]

        # CSVとして出力
        csv_content = segment_stats.to_csv(index=False, encoding="utf-8")
        print(f"セグメント統計CSV生成完了: {len(segment_stats)} セグメント")

        filename = f"rfm_segments_{session_id}.csv"
        csv_bytes = csv_content.encode("utf-8-sig")

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/csv; charset=utf-8",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ セグメント統計CSV出力エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"セグメント統計CSV出力中にエラーが発生しました: {str(e)}",
        )


@router.get("/debug/session/{session_id}/data")
async def debug_session_coordinates(session_id: int, db: Session = Depends(get_db)):
    """セッションの座標データをデバッグ用に表示"""
    try:
        from models import CoordinatesData

        coordinates = (
            db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .limit(10)
            .all()
        )  # 最初の10件のみ

        result = []
        for coord in coordinates:
            result.append(
                {
                    "point_name": coord.point_name,
                    "point_type": coord.point_type,
                    "dimensions": [
                        coord.dimension_1,
                        coord.dimension_2,
                        coord.dimension_3,
                        coord.dimension_4,
                    ],
                    "metadata": coord.metadata_json,
                }
            )

        return {
            "session_id": session_id,
            "total_count": db.query(CoordinatesData)
            .filter(CoordinatesData.session_id == session_id)
            .count(),
            "customer_count": db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .count(),
            "sample_data": result,
        }

    except Exception as e:
        return {"error": str(e)}


# routers/rfm.py に追加するマイグレーションエンドポイント


@router.post("/admin/fix-decimal-precision")
async def fix_decimal_precision(db: Session = Depends(get_db)):
    """DECIMAL精度問題を修正"""
    try:
        from sqlalchemy import text

        migration_steps = []

        # Step 1: metadata_jsonカラムを追加（まだ存在しない場合）
        try:
            add_metadata_sql = text(
                """
                ALTER TABLE coordinates_data 
                ADD COLUMN IF NOT EXISTS metadata_json JSONB
            """
            )
            db.execute(add_metadata_sql)
            migration_steps.append("metadata_jsonカラム追加")
        except Exception as e:
            migration_steps.append(f"metadata_jsonカラム追加スキップ: {str(e)}")

        # Step 2: DECIMAL精度を修正
        decimal_fixes = [
            ("dimension_1", "DECIMAL(10,2)", "Recency用"),
            ("dimension_2", "DECIMAL(10,2)", "Frequency用"),
            ("dimension_3", "DECIMAL(15,2)", "Monetary用（高精度）"),
            ("dimension_4", "DECIMAL(10,2)", "RFMスコア用"),
        ]

        for column, new_type, description in decimal_fixes:
            try:
                alter_sql = text(
                    f"""
                    ALTER TABLE coordinates_data 
                    ALTER COLUMN {column} TYPE {new_type}
                """
                )
                db.execute(alter_sql)
                migration_steps.append(f"{column}を{new_type}に変更 ({description})")
            except Exception as e:
                migration_steps.append(f"{column}変更エラー: {str(e)}")

        # Step 3: 失敗したセッションのデータを削除（オプション）
        try:
            cleanup_sql = text(
                """
                DELETE FROM coordinates_data 
                WHERE session_id IN (
                    SELECT DISTINCT session_id 
                    FROM coordinates_data 
                    WHERE session_id >= 315
                )
            """
            )
            result = db.execute(cleanup_sql)
            migration_steps.append(
                f"失敗したセッションデータを削除: {result.rowcount}件"
            )
        except Exception as e:
            migration_steps.append(f"データ削除エラー: {str(e)}")

        db.commit()

        # Step 4: 現在のテーブル構造を確認
        verify_sql = text(
            """
            SELECT column_name, data_type, numeric_precision, numeric_scale
            FROM information_schema.columns 
            WHERE table_name = 'coordinates_data' 
            AND column_name LIKE 'dimension_%'
            ORDER BY column_name
        """
        )

        columns = db.execute(verify_sql).fetchall()
        column_info = [
            {"column": col[0], "type": col[1], "precision": col[2], "scale": col[3]}
            for col in columns
        ]

        return {
            "success": True,
            "message": "DECIMAL精度修正完了",
            "migration_steps": migration_steps,
            "current_columns": column_info,
        }

    except Exception as e:
        db.rollback()
        import traceback

        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}


@router.get("/admin/check-table-structure")
async def check_table_structure(db: Session = Depends(get_db)):
    """テーブル構造を確認"""
    try:
        from sqlalchemy import text

        # coordinates_dataテーブルの構造を確認
        structure_sql = text(
            """
            SELECT 
                column_name, 
                data_type, 
                numeric_precision, 
                numeric_scale,
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_name = 'coordinates_data' 
            ORDER BY ordinal_position
        """
        )

        columns = db.execute(structure_sql).fetchall()

        table_structure = []
        for col in columns:
            col_info = {
                "column_name": col[0],
                "data_type": col[1],
                "is_nullable": col[4],
                "column_default": col[5],
            }

            # 数値型の場合は精度情報を追加
            if col[2] is not None:
                col_info["numeric_precision"] = col[2]
                col_info["numeric_scale"] = col[3]

            table_structure.append(col_info)

        # データ件数も確認
        count_sql = text(
            """
            SELECT 
                session_id,
                point_type,
                COUNT(*) as count
            FROM coordinates_data 
            GROUP BY session_id, point_type 
            ORDER BY session_id DESC 
            LIMIT 10
        """
        )

        data_counts = db.execute(count_sql).fetchall()
        count_info = [
            {"session_id": row[0], "point_type": row[1], "count": row[2]}
            for row in data_counts
        ]

        return {
            "success": True,
            "table_structure": table_structure,
            "data_counts": count_info,
        }

    except Exception as e:
        import traceback

        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}


# routers/rfm.py に追加する修正版マイグレーション


@router.post("/admin/fix-decimal-with-view-handling")
async def fix_decimal_with_view_handling(db: Session = Depends(get_db)):
    """VIEWを処理してからDECIMAL精度を修正"""
    try:
        from sqlalchemy import text

        migration_steps = []

        # Step 1: 既存のVIEWを確認
        check_views_sql = text(
            """
            SELECT schemaname, viewname, definition
            FROM pg_views 
            WHERE viewname LIKE '%rfm%' OR viewname LIKE '%analysis%'
        """
        )

        views = db.execute(check_views_sql).fetchall()
        migration_steps.append(f"発見されたVIEW数: {len(views)}")

        view_definitions = {}

        # Step 2: 関連するVIEWをバックアップして削除
        for view in views:
            view_name = view[1]
            view_definition = view[2]
            view_definitions[view_name] = view_definition
            migration_steps.append(f"VIEWバックアップ: {view_name}")

            try:
                drop_view_sql = text(f"DROP VIEW IF EXISTS {view_name} CASCADE")
                db.execute(drop_view_sql)
                migration_steps.append(f"VIEW削除成功: {view_name}")
            except Exception as e:
                migration_steps.append(f"VIEW削除エラー {view_name}: {str(e)}")

        # Step 3: DECIMAL精度を修正
        decimal_fixes = [
            ("dimension_1", "DECIMAL(10,2)", "Recency用"),
            ("dimension_2", "DECIMAL(10,2)", "Frequency用"),
            ("dimension_3", "DECIMAL(15,2)", "Monetary用（高精度）"),
            ("dimension_4", "DECIMAL(10,2)", "RFMスコア用"),
        ]

        for column, new_type, description in decimal_fixes:
            try:
                alter_sql = text(
                    f"""
                    ALTER TABLE coordinates_data 
                    ALTER COLUMN {column} TYPE {new_type}
                """
                )
                db.execute(alter_sql)
                migration_steps.append(f"✅ {column}を{new_type}に変更 ({description})")
            except Exception as e:
                migration_steps.append(f"❌ {column}変更エラー: {str(e)}")

        # Step 4: 失敗したセッションのデータを削除
        try:
            cleanup_sql = text(
                """
                DELETE FROM coordinates_data 
                WHERE session_id >= 315
            """
            )
            result = db.execute(cleanup_sql)
            migration_steps.append(
                f"✅ 失敗したセッションデータを削除: {result.rowcount}件"
            )
        except Exception as e:
            migration_steps.append(f"❌ データ削除エラー: {str(e)}")

        db.commit()

        # Step 5: VIEWを再作成（必要に応じて）
        # 注意: VIEW定義を手動で確認して必要なもののみ再作成
        recreated_views = []
        for view_name, definition in view_definitions.items():
            try:
                # VIEW定義を修正して再作成する場合
                # create_view_sql = text(f"CREATE VIEW {view_name} AS {definition}")
                # db.execute(create_view_sql)
                # recreated_views.append(view_name)
                migration_steps.append(
                    f"VIEW定義保存: {view_name} (手動で再作成が必要)"
                )
            except Exception as e:
                migration_steps.append(f"VIEW再作成エラー {view_name}: {str(e)}")

        # Step 6: 現在のテーブル構造を確認
        verify_sql = text(
            """
            SELECT column_name, data_type, numeric_precision, numeric_scale
            FROM information_schema.columns 
            WHERE table_name = 'coordinates_data' 
            AND column_name LIKE 'dimension_%'
            ORDER BY column_name
        """
        )

        columns = db.execute(verify_sql).fetchall()
        column_info = [
            {"column": col[0], "type": col[1], "precision": col[2], "scale": col[3]}
            for col in columns
        ]

        return {
            "success": True,
            "message": "DECIMAL精度修正完了（VIEW処理済み）",
            "migration_steps": migration_steps,
            "current_columns": column_info,
            "backed_up_views": list(view_definitions.keys()),
            "view_definitions": view_definitions,
        }

    except Exception as e:
        db.rollback()
        import traceback

        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}


@router.get("/admin/check-views")
async def check_views(db: Session = Depends(get_db)):
    """データベース内のVIEWを確認"""
    try:
        from sqlalchemy import text

        # 全VIEWを確認
        views_sql = text(
            """
            SELECT schemaname, viewname, definition
            FROM pg_views 
            WHERE schemaname = 'public'
            ORDER BY viewname
        """
        )

        views = db.execute(views_sql).fetchall()

        view_list = []
        for view in views:
            view_list.append(
                {
                    "schema": view[0],
                    "name": view[1],
                    "definition": (
                        view[2][:200] + "..." if len(view[2]) > 200 else view[2]
                    ),
                }
            )

        # coordinates_dataテーブルに依存するVIEWを特定
        dependent_views_sql = text(
            """
            SELECT DISTINCT 
                v.schemaname, 
                v.viewname,
                v.definition
            FROM pg_views v
            WHERE v.definition ILIKE '%coordinates_data%'
            OR v.definition ILIKE '%dimension_%'
        """
        )

        dependent_views = db.execute(dependent_views_sql).fetchall()

        dependent_list = []
        for view in dependent_views:
            dependent_list.append(
                {"schema": view[0], "name": view[1], "definition": view[2]}
            )

        return {
            "success": True,
            "all_views_count": len(view_list),
            "all_views": view_list,
            "dependent_views_count": len(dependent_list),
            "dependent_views": dependent_list,
        }

    except Exception as e:
        import traceback

        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}


# 緊急回避：データベース制約を無視してファイルベースで結果を保存
@router.post("/analyze-file-based")
async def analyze_rfm_file_based(
    file: UploadFile = File(...),
    session_name: str = Query(...),
    customer_id_col: str = Query("id"),
    date_col: str = Query("date"),
    amount_col: str = Query("price"),
    rfm_divisions: int = Query(3),
):
    """RFM分析（ファイルベース保存版・エンコーディング対応）"""
    try:
        print(f"=== ファイルベースRFM分析開始 ===")
        print(f"ファイル名: {file.filename}")

        # CSV読み込み（エンコーディング自動判定）
        contents = await file.read()

        # 複数のエンコーディングを試行
        csv_text = None
        encodings = [
            "utf-8",
            "shift_jis",
            "cp932",
            "euc-jp",
            "iso-2022-jp",
            "utf-8-sig",
        ]

        for encoding in encodings:
            try:
                csv_text = contents.decode(encoding)
                print(f"✅ エンコーディング判定成功: {encoding}")
                break
            except UnicodeDecodeError:
                print(f"❌ エンコーディング失敗: {encoding}")
                continue

        if csv_text is None:
            raise ValueError("対応するエンコーディングが見つかりません")

        # CSVテキストの確認
        print(f"CSVテキスト（最初の200文字）:\n{csv_text[:200]}")

        # DataFrameに変換
        import io

        df = pd.read_csv(io.StringIO(csv_text))
        print(f"データフレーム形状: {df.shape}")
        print(f"列名: {list(df.columns)}")
        print(f"最初の3行:\n{df.head(3)}")

        # RFM分析実行
        from analysis.rfm import RFMAnalysisAnalyzer

        analyzer = RFMAnalysisAnalyzer()

        results = analyzer.analyze(
            df=df,
            customer_id_col=customer_id_col,
            date_col=date_col,
            amount_col=amount_col,
            rfm_divisions=rfm_divisions,
        )

        print(f"RFM分析結果: 顧客数={results['total_customers']}")

        # プロット生成
        plot_base64 = analyzer.create_plot(results, df)
        print(f"プロット生成完了: {len(plot_base64)}文字")

        # ファイルに保存
        import json
        import os
        from datetime import datetime

        save_dir = "/tmp/rfm_results"
        os.makedirs(save_dir, exist_ok=True)

        # 保存データの準備
        result_data = {
            "session_name": session_name,
            "analysis_type": "rfm",
            "timestamp": datetime.now().isoformat(),
            "total_customers": results["total_customers"],
            "analysis_date": results["analysis_date"],
            "date_range": results["date_range"],
            "rfm_divisions": results["rfm_divisions"],
            # 顧客データ（全件保存）
            "customer_data": results["customer_rfm_data"],
            # 統計情報
            "segment_counts": results["segment_counts"],
            "rfm_stats": results["rfm_stats"],
            "segment_stats": results["segment_stats"],
            # プロット画像（Base64）
            "plot_image": plot_base64,
            # メタデータ
            "metadata": {
                "filename": file.filename,
                "encoding_used": encoding,
                "rows": df.shape[0],
                "columns": df.shape[1],
            },
        }

        # JSON形式で保存
        result_file = f"{save_dir}/{session_name}_complete.json"
        with open(result_file, "w", encoding="utf-8") as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)

        # 顧客データのみをCSV形式でも保存
        customer_csv_file = f"{save_dir}/{session_name}_customers.csv"
        with open(customer_csv_file, "w", encoding="utf-8-sig", newline="") as f:
            import csv

            writer = csv.writer(f)

            # ヘッダー
            writer.writerow(
                [
                    "customer_id",
                    "recency",
                    "frequency",
                    "monetary",
                    "rfm_score",
                    "r_score",
                    "f_score",
                    "m_score",
                    "segment",
                ]
            )

            # データ行
            for customer in results["customer_rfm_data"]:
                writer.writerow(
                    [
                        customer["customer_id"],
                        customer["recency"],
                        customer["frequency"],
                        customer["monetary"],
                        customer["rfm_score"],
                        customer["r_score"],
                        customer["f_score"],
                        customer["m_score"],
                        customer["segment"],
                    ]
                )

        print(f"✅ ファイル保存完了:")
        print(f"  - JSON: {result_file}")
        print(f"  - CSV:  {customer_csv_file}")

        # レスポンス（実際のRFM分析結果を返す）
        return {
            "success": True,
            "session_name": session_name,
            "analysis_type": "rfm",
            "data": {
                "total_customers": results["total_customers"],
                "analysis_date": results["analysis_date"],
                "date_range": results["date_range"],
                "rfm_divisions": results["rfm_divisions"],
                # 顧客データ（最初の100件のみレスポンスに含める）
                "customer_data": results["customer_rfm_data"][:100],
                # 統計情報
                "segment_counts": results["segment_counts"],
                "rfm_stats": results["rfm_stats"],
                "segment_definitions": results["segment_definitions"],
                # プロット画像
                "plot_image": plot_base64,
            },
            "metadata": {
                "filename": file.filename,
                "encoding_used": encoding,
                "result_files": {
                    "json": result_file,
                    "csv": customer_csv_file,
                },
                "download_urls": {
                    "csv": f"/api/rfm/download-file/{session_name}",
                    "json": f"/api/rfm/download-json/{session_name}",
                },
            },
        }

    except Exception as e:
        print(f"ファイルベース分析エラー: {str(e)}")
        import traceback

        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-file/{session_name}")
async def download_rfm_csv(session_name: str):
    """RFMの顧客データをCSVでダウンロード"""
    try:
        from fastapi import Response

        customer_csv_file = f"/tmp/rfm_results/{session_name}_customers.csv"

        # ファイルの存在確認
        if not os.path.exists(customer_csv_file):
            raise HTTPException(
                status_code=404,
                detail=f"セッション {session_name} のCSVファイルが見つかりません",
            )

        # ファイル読み込み
        with open(customer_csv_file, "r", encoding="utf-8-sig") as f:
            csv_content = f.read()

        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="rfm_customers_{session_name}.csv"'
            },
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-file/{session_name}")
async def download_rfm_csv(session_name: str):
    """RFMの顧客データをCSVでダウンロード（修正版）"""
    try:
        import os
        from fastapi import Response
        
        print(f"=== CSVダウンロード開始: {session_name} ===")
        
        customer_csv_file = f"/tmp/rfm_results/{session_name}_customers.csv"
        print(f"ファイルパス: {customer_csv_file}")
        
        # ファイルの存在確認
        if not os.path.exists(customer_csv_file):
            print(f"❌ ファイルが見つかりません: {customer_csv_file}")
            # 利用可能なファイル一覧を表示
            try:
                files = os.listdir("/tmp/rfm_results/")
                print(f"利用可能なファイル: {files}")
            except:
                print("結果ディレクトリが存在しません")
            
            raise HTTPException(status_code=404, detail=f"セッション {session_name} のCSVファイルが見つかりません")
        
        # ファイルサイズ確認
        file_size = os.path.getsize(customer_csv_file)
        print(f"ファイルサイズ: {file_size} bytes")
        
        # ファイル読み込み
        try:
            with open(customer_csv_file, 'r', encoding='utf-8-sig') as f:
                csv_content = f.read()
            print(f"ファイル読み込み成功: {len(csv_content)} 文字")
        except Exception as e:
            print(f"❌ ファイル読み込みエラー: {e}")
            # UTF-8で読み込み再試行
            try:
                with open(customer_csv_file, 'r', encoding='utf-8') as f:
                    csv_content = f.read()
                print(f"UTF-8で読み込み成功: {len(csv_content)} 文字")
            except Exception as e2:
                print(f"❌ UTF-8読み込みもエラー: {e2}")
                raise HTTPException(status_code=500, detail=f"ファイル読み込みエラー: {e2}")
        
        # CSVコンテンツの先頭確認
        print(f"CSV先頭200文字:\n{csv_content[:200]}")
        
        return Response(
            content=csv_content.encode('utf-8-sig'),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="rfm_customers_{session_name}.csv"',
                "Content-Length": str(len(csv_content.encode('utf-8-sig')))
            },
        )
        
    except HTTPException:
        raise  # HTTPExceptionは再発生
    except Exception as e:
        print(f"❌ ダウンロード予期しないエラー: {str(e)}")
        import traceback
        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"ダウンロードエラー: {str(e)}")


@router.get("/download-json/{session_name}")
async def download_rfm_json(session_name: str):
    """RFMの分析結果をJSONでダウンロード（修正版）"""
    try:
        import os
        from fastapi import Response
        
        print(f"=== JSONダウンロード開始: {session_name} ===")
        
        result_file = f"/tmp/rfm_results/{session_name}_complete.json"
        
        if not os.path.exists(result_file):
            print(f"❌ JSONファイルが見つかりません: {result_file}")
            raise HTTPException(status_code=404, detail=f"セッション {session_name} のJSONファイルが見つかりません")
        
        with open(result_file, 'r', encoding='utf-8') as f:
            json_content = f.read()
        
        print(f"JSON読み込み成功: {len(json_content)} 文字")
        
        return Response(
            content=json_content.encode('utf-8'),
            media_type="application/json; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="rfm_analysis_{session_name}.json"',
                "Content-Length": str(len(json_content.encode('utf-8')))
            },
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ JSONダウンロードエラー: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/files")
async def debug_files():
    """保存されたファイルのデバッグ情報"""
    try:
        import os
        
        save_dir = "/tmp/rfm_results"
        
        if not os.path.exists(save_dir):
            return {"error": "結果ディレクトリが存在しません", "path": save_dir}
        
        files_info = []
        for filename in os.listdir(save_dir):
            file_path = os.path.join(save_dir, filename)
            stat = os.stat(file_path)
            
            files_info.append({
                "filename": filename,
                "size": stat.st_size,
                "created": stat.st_ctime,
                "modified": stat.st_mtime,
            })
        
        return {
            "directory": save_dir,
            "files": files_info,
            "total_files": len(files_info)
        }
        
    except Exception as e:
        return {"error": str(e)}


# 緊急回避：直接ファイル内容を返すエンドポイント
@router.get("/download-direct/{session_name}")
async def download_direct_csv(session_name: str):
    """直接CSVコンテンツを返す（デバッグ用）"""
    try:
        import os
        
        customer_csv_file = f"/tmp/rfm_results/{session_name}_customers.csv"
        
        if not os.path.exists(customer_csv_file):
            return {"error": "ファイルが見つかりません", "path": customer_csv_file}
        
        # ファイル内容を直接読み込み
        with open(customer_csv_file, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
        
        return {
            "success": True,
            "filename": customer_csv_file,
            "total_lines": len(lines),
            "header": lines[0].strip() if lines else "",
            "first_5_lines": [line.strip() for line in lines[:5]],
            "last_2_lines": [line.strip() for line in lines[-2:]] if len(lines) > 2 else [],
        }
        
    except Exception as e:
        return {"error": str(e)}