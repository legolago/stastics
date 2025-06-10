from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DECIMAL,
    TIMESTAMP,
    ForeignKey,
    LargeBinary,
    ARRAY,
    UniqueConstraint,
    Float,
    Boolean,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import os

# データベース接続設定
DATABASE_URL = f"postgresql://{os.getenv('DB_USER', 'user')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'db')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'analysis')}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_size = Column(Integer)
    upload_timestamp = Column(TIMESTAMP, default=datetime.utcnow)
    analysis_timestamp = Column(TIMESTAMP, default=datetime.utcnow)
    description = Column(Text)
    tags = Column(ARRAY(String))
    user_id = Column(String(100))

    # 🆕 分析手法の種類を追加
    analysis_type = Column(String(50))
    row_count = Column(Integer)
    column_count = Column(Integer)
    dimensions_count = Column(Integer)
    dimension_1_contribution = Column(Float)
    dimension_2_contribution = Column(Float)
    rotation = Column(String(50))  # 'varimax', 'promax', etc.
    standardized = Column(Boolean)
    total_inertia = Column(Float)
    chi2_value = Column(Float)
    degrees_of_freedom = Column(Integer)

    # 分析結果の統計情報
    total_inertia = Column(DECIMAL(10, 8))
    chi2_value = Column(DECIMAL(15, 4))
    degrees_of_freedom = Column(Integer)
    row_count = Column(Integer)
    column_count = Column(Integer)

    # 次元数と寄与率
    dimensions_count = Column(Integer, default=2)
    dimension_1_contribution = Column(DECIMAL(8, 6))
    dimension_2_contribution = Column(DECIMAL(8, 6))

    # 分析設定
    analysis_parameters = Column(JSONB)

    # RFM分析固有のフィールドを追加（既存のフィールドの後に）
    total_customers = Column(Integer, nullable=True)  # 総顧客数
    analysis_period_days = Column(Integer, nullable=True)  # 分析期間（日数）

    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow)

    # リレーション
    original_data = relationship(
        "OriginalData", back_populates="session", cascade="all, delete-orphan"
    )
    coordinates = relationship(
        "CoordinatesData", back_populates="session", cascade="all, delete-orphan"
    )
    visualizations = relationship(
        "VisualizationData", back_populates="session", cascade="all, delete-orphan"
    )
    eigenvalues = relationship(
        "EigenvalueData", back_populates="session", cascade="all, delete-orphan"
    )
    # 🆕 新しいリレーション
    metadata_entries = relationship(
        "AnalysisMetadata", back_populates="session", cascade="all, delete-orphan"
    )


class OriginalData(Base):
    __tablename__ = "original_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    csv_data = Column(Text, nullable=False)
    row_names = Column(ARRAY(String))
    column_names = Column(ARRAY(String))
    data_matrix = Column(JSONB)

    # リレーション
    session = relationship("AnalysisSession", back_populates="original_data")


class CoordinatesData(Base):
    __tablename__ = "coordinates_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    # 🆕 拡張されたpoint_type: 'row', 'column', 'observation', 'variable', 'factor', 'customer'
    point_type = Column(String(20), nullable=False)
    point_name = Column(String(255), nullable=False)
    dimension_1 = Column(DECIMAL(12, 8))
    dimension_2 = Column(DECIMAL(12, 8))
    contribution_dim1 = Column(DECIMAL(8, 6))
    contribution_dim2 = Column(DECIMAL(8, 6))
    quality_representation = Column(DECIMAL(8, 6))

    # 追加の次元
    dimension_3 = Column(DECIMAL(12, 8))
    dimension_4 = Column(DECIMAL(12, 8))

    # 🆕 一意制約の名前を明示的に指定
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "point_type",
            "point_name",
            name="uq_coordinates_session_type_name",
        ),
    )

    # リレーション
    session = relationship("AnalysisSession", back_populates="coordinates")


class VisualizationData(Base):
    __tablename__ = "visualization_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    # 🆕 拡張されたimage_type
    image_type = Column(String(50), default="correspondence_plot")
    image_data = Column(LargeBinary, nullable=True)
    image_base64 = Column(Text)
    image_size = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    dpi = Column(Integer, default=300)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    # リレーション
    session = relationship("AnalysisSession", back_populates="visualizations")


class EigenvalueData(Base):
    __tablename__ = "eigenvalue_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    dimension_number = Column(Integer, nullable=False)
    eigenvalue = Column(DECIMAL(12, 8))
    explained_inertia = Column(DECIMAL(8, 6))
    cumulative_inertia = Column(DECIMAL(8, 6))

    # 🆕 一意制約の名前を明示的に指定
    __table_args__ = (
        UniqueConstraint(
            "session_id", "dimension_number", name="uq_eigenvalue_session_dimension"
        ),
    )

    # リレーション
    session = relationship("AnalysisSession", back_populates="eigenvalues")


# 🆕 新しいテーブル: 分析手法固有のメタデータ
class AnalysisMetadata(Base):
    __tablename__ = "analysis_metadata"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    metadata_type = Column(
        String(50), nullable=False
    )  # 'pca_loadings', 'factor_loadings', etc.
    metadata_content = Column(JSONB, nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    # 🆕 一意制約
    __table_args__ = (
        UniqueConstraint(
            "session_id", "metadata_type", name="uq_metadata_session_type"
        ),
    )

    # リレーション
    session = relationship("AnalysisSession", back_populates="metadata_entries")


# データベースの依存性注入用
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# テーブル作成
def create_tables():
    Base.metadata.create_all(bind=engine)


# 🆕 分析手法別のヘルパー関数
def get_sessions_by_analysis_type(
    db, analysis_type: str, user_id: str = None, limit: int = 50, offset: int = 0
):
    """分析手法別にセッションを取得"""
    query = db.query(AnalysisSession).filter(
        AnalysisSession.analysis_type == analysis_type
    )

    if user_id:
        query = query.filter(AnalysisSession.user_id == user_id)

    return (
        query.order_by(AnalysisSession.analysis_timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def get_analysis_summary_stats(db):
    """分析手法別の統計情報を取得"""
    from sqlalchemy import func

    stats = (
        db.query(
            AnalysisSession.analysis_type,
            func.count(AnalysisSession.id).label("count"),
            func.max(AnalysisSession.analysis_timestamp).label("latest_analysis"),
        )
        .group_by(AnalysisSession.analysis_type)
        .all()
    )

    return [
        {
            "analysis_type": stat.analysis_type,
            "count": stat.count,
            "latest_analysis": (
                stat.latest_analysis.isoformat() if stat.latest_analysis else None
            ),
        }
        for stat in stats
    ]


# 🆕 分析手法の定数
class AnalysisTypes:
    CORRESPONDENCE = "correspondence"
    PCA = "pca"
    FACTOR = "factor"
    CLUSTER = "cluster"
    REGRESSION = "regression"
    RFM = "rfm"  # 🆕 追加

    @classmethod
    def all(cls):
        return [cls.CORRESPONDENCE, cls.PCA, cls.FACTOR, cls.CLUSTER]

    @classmethod
    def is_valid(cls, analysis_type: str):
        return analysis_type in cls.all()


class SessionTag(Base):
    __tablename__ = "session_tags"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    tag_name = Column(String(100), nullable=False)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    # 一意制約
    __table_args__ = (
        UniqueConstraint("session_id", "tag_name", name="uq_session_tag"),
    )

    # リレーション
    session = relationship("AnalysisSession")


# 🆕 メタデータタイプの定数
class MetadataTypes:
    # 主成分分析用
    PCA_LOADINGS = "pca_loadings"
    PCA_SCORES = "pca_scores"
    PCA_VARIANCE_EXPLAINED = "pca_variance_explained"

    # 因子分析用
    FACTOR_LOADINGS = "factor_loadings"
    FACTOR_SCORES = "factor_scores"
    FACTOR_ROTATION_MATRIX = "factor_rotation_matrix"

    # クラスター分析用
    CLUSTER_CENTERS = "cluster_centers"
    CLUSTER_ASSIGNMENTS = "cluster_assignments"
    CLUSTER_METRICS = "cluster_metrics"

    # 🆕 回帰分析用
    REGRESSION_STATS = "regression_stats"
    REGRESSION_COEFFICIENTS = "regression_coefficients"
    REGRESSION_PREDICTIONS = "regression_predictions"
    REGRESSION_RESIDUALS = "regression_residuals"

    # RFM分析用を追加
    RFM_STATISTICS = "rfm_statistics"
    RFM_SEGMENTS = "rfm_segments"
    RFM_CUSTOMER_DATA = "rfm_customer_data"

    @classmethod
    def get_types_for_analysis(cls, analysis_type: str):
        """分析手法に対応するメタデータタイプを取得"""
        type_mapping = {
            AnalysisTypes.PCA: [
                cls.PCA_LOADINGS,
                cls.PCA_SCORES,
                cls.PCA_VARIANCE_EXPLAINED,
            ],
            AnalysisTypes.FACTOR: [
                cls.FACTOR_LOADINGS,
                cls.FACTOR_SCORES,
                cls.FACTOR_ROTATION_MATRIX,
            ],
            AnalysisTypes.CLUSTER: [
                cls.CLUSTER_CENTERS,
                cls.CLUSTER_ASSIGNMENTS,
                cls.CLUSTER_METRICS,
            ],
            AnalysisTypes.REGRESSION: [
                cls.REGRESSION_STATS,
                cls.REGRESSION_COEFFICIENTS,
                cls.REGRESSION_PREDICTIONS,
                cls.REGRESSION_RESIDUALS,
            ],
            # RFM分析用を追加
            AnalysisTypes.RFM: [
                cls.RFM_STATISTICS,
                cls.RFM_SEGMENTS,
                cls.RFM_CUSTOMER_DATA,
            ],
        }
        return type_mapping.get(analysis_type, [])

    def get_rfm_customer_segments(db, session_id: int):
        """RFM分析のセッションから顧客セグメント情報を取得"""
        from sqlalchemy import func

        # 顧客データを取得
        customers = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .all()
        )

        # セグメント別集計
        segment_summary = {}
        for customer in customers:
            if customer.metadata_json and "segment" in customer.metadata_json:
                segment = customer.metadata_json["segment"]
                if segment not in segment_summary:
                    segment_summary[segment] = {
                        "count": 0,
                        "avg_recency": 0,
                        "avg_frequency": 0,
                        "avg_monetary": 0,
                        "total_recency": 0,
                        "total_frequency": 0,
                        "total_monetary": 0,
                    }

                segment_summary[segment]["count"] += 1
                segment_summary[segment]["total_recency"] += customer.dimension_1 or 0
                segment_summary[segment]["total_frequency"] += customer.dimension_2 or 0
                segment_summary[segment]["total_monetary"] += customer.dimension_3 or 0

        # 平均値を計算
        for segment, data in segment_summary.items():
            if data["count"] > 0:
                data["avg_recency"] = data["total_recency"] / data["count"]
                data["avg_frequency"] = data["total_frequency"] / data["count"]
                data["avg_monetary"] = data["total_monetary"] / data["count"]

        return segment_summary

    def get_rfm_statistics(db, session_id: int):
        """RFM分析の統計情報を取得"""
        # メタデータから統計情報を取得
        metadata = (
            db.query(AnalysisMetadata)
            .filter(
                AnalysisMetadata.session_id == session_id,
                AnalysisMetadata.metadata_type == MetadataTypes.RFM_STATISTICS,
            )
            .first()
        )

        if metadata:
            return metadata.metadata_content

        return None
