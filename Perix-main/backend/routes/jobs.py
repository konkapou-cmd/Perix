"""Job routes."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta, timezone
import uuid

from database import db
from routes.dependencies import get_current_user, UserPublic
from routes.uploads import upload_to_cloudinary
from routes.ws import ws_broadcast_notification

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobCreate(BaseModel):
    title: str
    description: str
    cover_image: Optional[str] = None
    root_category: str
    subcategory: str
    expires_at: Optional[str] = None
    job_type: Optional[str] = None
    requirements: Optional[str] = None
    salary_range: Optional[str] = None
    work_location: Optional[str] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_image: Optional[str] = None
    is_active: Optional[bool] = None
    job_type: Optional[str] = None
    requirements: Optional[str] = None
    salary_range: Optional[str] = None
    work_location: Optional[str] = None


class JobApplicationCreate(BaseModel):
    message: str
    cv_url: Optional[str] = None
    cover_letter_url: Optional[str] = None


def job_response(job: dict, business: dict = None) -> dict:
    """Format job for response"""
    return {
        "job_id": job.get("job_id"),
        "business_id": job.get("business_id"),
        "title": job.get("title"),
        "description": job.get("description"),
        "cover_image": job.get("cover_image"),
        "job_type": job.get("job_type"),
        "requirements": job.get("requirements"),
        "salary_range": job.get("salary_range"),
        "work_location": job.get("work_location"),
        "root_category": job.get("root_category"),
        "subcategory": job.get("subcategory"),
        "location": job.get("location"),
        "latitude": job.get("latitude"),
        "longitude": job.get("longitude"),
        "is_active": job.get("is_active", True),
        "created_at": job.get("created_at"),
        "expires_at": job.get("expires_at"),
        "business_name": business.get("name") if business else job.get("business_name"),
        "business_logo": business.get("profile_photo") if business else job.get("business_logo"),
    }



@router.get("/applications/my")
async def get_my_applications(current_user: UserPublic = Depends(get_current_user)):
    """Get all applications submitted by the current user"""
    applications = await db.job_applications.find(
        {"applicant_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Enrich with job details
    result = []
    for app in applications:
        job = await db.jobs.find_one({"job_id": app["job_id"]}, {"_id": 0, "title": 1, "business_name": 1, "business_logo": 1, "location": 1})
        result.append({
            **app,
            "job_title": job.get("title") if job else "Unknown",
            "business_name": job.get("business_name") if job else app.get("business_name", "Unknown"),
            "business_logo": job.get("business_logo") if job else None,
            "job_location": job.get("location") if job else None,
        })
    
    return result

@router.post("")
async def create_job(
    job_data: JobCreate,
    current_user: UserPublic = Depends(get_current_user)
):
    """Create a new job posting (business owners only)"""
    # Check if user has a business
    business = await db.businesses.find_one(
        {"owner_id": current_user.user_id},
        {"_id": 0}
    )
    if not business:
        raise HTTPException(status_code=403, detail="Only business owners can post jobs")
    
    # Calculate expiry date (default 3 weeks)
    if job_data.expires_at:
        expires_at = datetime.fromisoformat(job_data.expires_at.replace("Z", "+00:00"))
    else:
        expires_at = datetime.now(timezone.utc) + timedelta(weeks=3)
    
    job = {
        "job_id": f"job_{uuid.uuid4().hex[:12]}",
        "business_id": business["business_id"],
        "owner_id": current_user.user_id,
        "title": job_data.title,
        "description": job_data.description,
        "cover_image": job_data.cover_image,
        "job_type": job_data.job_type,
        "requirements": job_data.requirements,
        "salary_range": job_data.salary_range,
        "work_location": job_data.work_location,
        "root_category": job_data.root_category or business.get("root_category"),
        "subcategory": job_data.subcategory or business.get("subcategory"),
        "location": business.get("address"),
        "latitude": business.get("latitude"),
        "longitude": business.get("longitude"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at.isoformat(),
        "business_name": business.get("name"),
        "business_logo": business.get("profile_photo"),
    }
    
    await db.jobs.insert_one(job)
    return job_response(job, business)


@router.get("")
async def get_jobs(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    max_distance_km: float = 50,
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    root_category: Optional[str] = None,
    subcategory: Optional[str] = None,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get all active jobs, optionally filtered by location and category"""
    now = datetime.now(timezone.utc).isoformat()
    
    query = {
        "is_active": True,
        "expires_at": {"$gt": now}
    }
    
    if root_category:
        query["root_category"] = root_category
    if subcategory:
        query["subcategory"] = subcategory
    
    jobs = await db.jobs.find(query, {"_id": 0}).to_list(100)
    
    # Filter by bounding box if bounds provided
    use_bounds = all([min_lat, max_lat, min_lng, max_lng])
    if use_bounds:
        filtered_jobs = []
        for job in jobs:
            if job.get("latitude") and job.get("longitude"):
                if min_lat <= job["latitude"] <= max_lat and min_lng <= job["longitude"] <= max_lng:
                    filtered_jobs.append(job)
        jobs = filtered_jobs
    # Filter by distance if center point provided (and no bounds)
    elif latitude and longitude:
        from math import radians, sin, cos, sqrt, atan2
        
        def haversine(lat1, lon1, lat2, lon2):
            R = 6371  # Earth's radius in km
            dlat = radians(lat2 - lat1)
            dlon = radians(lon2 - lon1)
            a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            return R * c
        
        filtered_jobs = []
        for job in jobs:
            if job.get("latitude") and job.get("longitude"):
                distance = haversine(latitude, longitude, job["latitude"], job["longitude"])
                if distance <= max_distance_km:
                    job["distance_km"] = round(distance, 2)
                    filtered_jobs.append(job)
        
        # Sort by distance
        filtered_jobs.sort(key=lambda x: x.get("distance_km", 999))
        jobs = filtered_jobs
    
    jobs_list = [job_response(job) for job in jobs]
    return {"jobs": jobs_list, "total": len(jobs_list)}


@router.get("/my")
async def get_my_jobs(current_user: UserPublic = Depends(get_current_user)):
    """Get jobs posted by current user's business"""
    business = await db.businesses.find_one(
        {"owner_id": current_user.user_id},
        {"_id": 0, "business_id": 1}
    )
    if not business:
        return []
    
    jobs = await db.jobs.find(
        {"business_id": business["business_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    
    return [job_response(job) for job in jobs]


@router.get("/{job_id}")
async def get_job(job_id: str, current_user: UserPublic = Depends(get_current_user)):
    """Get a specific job by ID"""
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    business = await db.businesses.find_one(
        {"business_id": job["business_id"]},
        {"_id": 0, "name": 1, "profile_photo": 1, "address": 1}
    )
    
    return job_response(job, business)


@router.put("/{job_id}")
async def update_job(
    job_id: str,
    job_data: JobUpdate,
    current_user: UserPublic = Depends(get_current_user)
):
    """Update a job posting (owner only)"""
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    update_data = {k: v for k, v in job_data.dict().items() if v is not None}
    if update_data:
        await db.jobs.update_one(
            {"job_id": job_id},
            {"$set": update_data}
        )
    
    updated_job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    return job_response(updated_job)


@router.delete("/{job_id}")
async def delete_job(job_id: str, current_user: UserPublic = Depends(get_current_user)):
    """Delete a job posting (owner only)"""
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.jobs.delete_one({"job_id": job_id})
    await db.job_applications.delete_many({"job_id": job_id})
    
    return {"success": True, "message": "Job deleted successfully"}


# Job Applications

@router.post("/{job_id}/apply")
async def apply_to_job(
    job_id: str,
    application: JobApplicationCreate,
    current_user: UserPublic = Depends(get_current_user)
):
    """Apply to a job"""
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Check if already applied
    existing = await db.job_applications.find_one({
        "job_id": job_id,
        "applicant_id": current_user.user_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Already applied to this job")
    
    application_doc = {
        "application_id": f"app_{uuid.uuid4().hex[:12]}",
        "job_id": job_id,
        "business_id": job["business_id"],
        "applicant_id": current_user.user_id,
        "applicant_name": current_user.name,
        "applicant_email": current_user.email,
        "message": application.message,
        "cv_url": application.cv_url,
        "cover_letter_url": application.cover_letter_url,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.job_applications.insert_one(application_doc)
    
    # Send notification to job owner
    notification = {
        "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
        "user_id": job["owner_id"],
        "type": "job_application",
        "title": "New Job Application",
        "message": f"{current_user.name} applied to {job['title']}",
        "data": {"job_id": job_id, "application_id": application_doc["application_id"]},
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.notifications.insert_one(notification)
    
    import asyncio
    asyncio.create_task(ws_broadcast_notification(
        job["owner_id"],
        {k: v for k, v in notification.items() if k != "_id"},
    ))
    
    return {
        "success": True,
        "message": "Application submitted successfully",
        "application_id": application_doc["application_id"]
    }


@router.get("/{job_id}/applications")
async def get_job_applications(
    job_id: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Get all applications for a job (owner only)"""
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    applications = await db.job_applications.find(
        {"job_id": job_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return applications


@router.put("/applications/{application_id}/status")
async def update_application_status(
    application_id: str,
    status: str,
    current_user: UserPublic = Depends(get_current_user)
):
    """Update application status (owner only)"""
    application = await db.job_applications.find_one(
        {"application_id": application_id},
        {"_id": 0}
    )
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    
    job = await db.jobs.find_one({"job_id": application["job_id"]}, {"_id": 0})
    if job["owner_id"] != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if status not in ["pending", "reviewed", "accepted", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    await db.job_applications.update_one(
        {"application_id": application_id},
        {"$set": {"status": status}}
    )
    
    return {"success": True, "status": status}
