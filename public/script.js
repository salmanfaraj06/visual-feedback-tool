document.addEventListener('DOMContentLoaded', () => {
    const listView = document.getElementById('listView');
    const feedbackView = document.getElementById('feedbackView');
    const uploadForm = document.getElementById('uploadForm');
    const imageFile = document.getElementById('imageFile');
    const uploadMessage = document.getElementById('uploadMessage');
    const imageList = document.getElementById('imageList');
    const backButton = document.getElementById('backButton');
    const imageTitle = document.getElementById('imageTitle');
    const imageContainer = document.getElementById('imageContainer');
    const feedbackImage = document.getElementById('feedbackImage');
    const commentList = document.getElementById('comments'); // Corrected ID
    const commentForm = document.getElementById('commentForm');
    const commentText = document.getElementById('commentText');
    const submitComment = document.getElementById('submitComment');
    const cancelComment = document.getElementById('cancelComment');
    const commentMessage = document.getElementById('commentMessage');

    let currentImageId = null;
    let pendingCommentMarker = null;
    let pendingCommentCoords = null; // {x, y} percentages

    // --- Routing and View Management ---

    function showListView() {
        listView.style.display = 'block';
        feedbackView.style.display = 'none';
        currentImageId = null;
        history.pushState({ view: 'list' }, '', '/');
        loadImages();
        clearPendingComment(); // Clear any pending state when going back
    }

    function showFeedbackView(imageId) {
        listView.style.display = 'none';
        feedbackView.style.display = 'block';
        currentImageId = imageId;
        history.pushState({ view: 'feedback', imageId: imageId }, '', `/feedback/${imageId}`);
        loadImageForFeedback(imageId);
        clearPendingComment(); // Clear any pending state when loading new image
    }

    // Initial load based on URL
    function handleRouteChange() {
        const path = window.location.pathname;
        const match = path.match(/^\/feedback\/([a-zA-Z0-9-]+)$/);
        if (match) {
            showFeedbackView(match[1]);
        } else {
            showListView();
        }
    }

    // Handle browser back/forward
    window.onpopstate = (event) => {
        if (event.state) {
            if (event.state.view === 'feedback') {
                showFeedbackView(event.state.imageId);
            } else {
                showListView();
            }
        } else {
            // Fallback if state is null (e.g., initial load)
             handleRouteChange();
        }
    };

    // --- API Calls ---

    async function fetchApi(url, options = {}) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            // Handle cases where response might be empty (e.g., 201 No Content)
             const contentType = response.headers.get("content-type");
             if (contentType && contentType.indexOf("application/json") !== -1) {
                 return await response.json();
             } else {
                 return await response.text(); // Or handle as needed
             }
        } catch (error) {
            console.error('API Fetch Error:', error);
            throw error; // Re-throw to be caught by caller
        }
    }

    // --- List View Logic ---

    async function loadImages() {
        imageList.innerHTML = '<li>Loading...</li>'; // Clear previous list
        try {
            const images = await fetchApi('/api/images');
            imageList.innerHTML = ''; // Clear loading message
            if (images.length === 0) {
                imageList.innerHTML = '<li>No images uploaded yet.</li>';
            } else {
                images.sort((a, b) => new Date(b.uploadTimestamp) - new Date(a.uploadTimestamp)); // Sort newest first
                images.forEach(img => {
                    const li = document.createElement('li');
                    const link = document.createElement('a');
                    link.href = `/feedback/${img.id}`;
                    link.textContent = img.originalName;
                    link.onclick = (e) => {
                        e.preventDefault();
                        showFeedbackView(img.id);
                    };
                    const dateSpan = document.createElement('span');
                    dateSpan.textContent = `Uploaded: ${new Date(img.uploadTimestamp).toLocaleString()}`;

                    li.appendChild(link);
                    li.appendChild(dateSpan);
                    imageList.appendChild(li);
                });
            }
        } catch (error) {
            imageList.innerHTML = `<li>Error loading images: ${error.message}</li>`;
        }
    }

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        uploadMessage.textContent = 'Uploading...';
        uploadMessage.className = '';

        const formData = new FormData();
        formData.append('imageFile', imageFile.files[0]);

        try {
            const result = await fetchApi('/api/upload', {
                method: 'POST',
                body: formData,
            });
            uploadMessage.textContent = result.message || 'Upload successful!';
            uploadMessage.className = 'success';
            uploadForm.reset(); // Clear the form
            loadImages(); // Refresh the list
        } catch (error) {
            uploadMessage.textContent = `Upload failed: ${error.message}`;
            uploadMessage.className = 'error';
        }
    });

    // --- Feedback View Logic ---

    backButton.addEventListener('click', showListView);

    async function loadImageForFeedback(imageId) {
        imageTitle.textContent = 'Loading image...';
        feedbackImage.src = '';
        commentList.innerHTML = ''; // Clear previous comments
        clearMarkers(); // Clear previous markers

        try {
            // We need to get the image path from the /api/images data
            // This is slightly inefficient, ideally the server would provide it directly
            // or we'd have a dedicated /api/images/:id endpoint
            const allImages = await fetchApi('/api/images');
            const imageData = allImages.find(img => img.id === imageId);

            if (!imageData) {
                throw new Error('Image metadata not found.');
            }

            imageTitle.textContent = `Feedback for: ${imageData.originalName}`;
            feedbackImage.src = imageData.filePath; // Use the path from the server
            feedbackImage.onload = () => { // Ensure image is loaded before loading comments/markers
                 loadComments(imageId);
            }
            feedbackImage.onerror = () => {
                 imageTitle.textContent = `Error loading image: ${imageData.originalName}`;
                 commentList.innerHTML = '<li>Could not load image.</li>';
            }

        } catch (error) {
            imageTitle.textContent = 'Error loading image';
            commentList.innerHTML = `<li>Error: ${error.message}</li>`;
        }
    }

    async function loadComments(imageId) {
        commentList.innerHTML = '<li>Loading comments...</li>';
        clearMarkers();
        try {
            const comments = await fetchApi(`/api/comments/${imageId}`);
            commentList.innerHTML = ''; // Clear loading
            if (comments.length === 0) {
                commentList.innerHTML = '<li>No comments yet. Click on the image to add one!</li>';
            } else {
                comments.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort oldest first
                comments.forEach((comment, index) => {
                    addCommentToList(comment, index + 1);
                    addCommentMarker(comment, index + 1);
                });
            }
        } catch (error) {
            commentList.innerHTML = `<li>Error loading comments: ${error.message}</li>`;
        }
    }

    function addCommentToList(comment, number) {
        const li = document.createElement('li');
        li.dataset.commentId = comment.id; // Store comment ID
        li.innerHTML = `
            <strong>Comment #${number} (at ${comment.x.toFixed(1)}%, ${comment.y.toFixed(1)}%)</strong>
            <p>${escapeHtml(comment.text)}</p>
            <span>${new Date(comment.timestamp).toLocaleString()}</span>
        `;
        // Highlight marker on hover/click? (Future enhancement)
        commentList.appendChild(li);
    }

    function addCommentMarker(comment, number) {
        const marker = document.createElement('div');
        marker.className = 'comment-marker';
        marker.textContent = number;
        marker.style.left = `${comment.x}%`;
        marker.style.top = `${comment.y}%`;
        marker.title = `Comment #${number}: ${escapeHtml(comment.text.substring(0, 50))}...`; // Tooltip
        marker.dataset.commentId = comment.id;
        // Add click listener to scroll to comment? (Future enhancement)
        imageContainer.appendChild(marker);
    }

     function clearMarkers() {
        const existingMarkers = imageContainer.querySelectorAll('.comment-marker');
        existingMarkers.forEach(marker => marker.remove());
     }

    // --- Adding Comments ---

    imageContainer.addEventListener('click', (e) => {
        // Prevent adding comment if clicking on an existing marker
        if (e.target.classList.contains('comment-marker')) {
            return;
        }
        // Allow only one pending comment at a time
        if (pendingCommentMarker) {
            return;
        }

        const rect = imageContainer.getBoundingClientRect();
        const img = feedbackImage;
        const imgRect = img.getBoundingClientRect();

        // Calculate click position relative to the image itself
        const offsetX = e.clientX - imgRect.left;
        const offsetY = e.clientY - imgRect.top;

        // Calculate percentage position based on the image's displayed dimensions
        const xPercent = (offsetX / img.clientWidth) * 100;
        const yPercent = (offsetY / img.clientHeight) * 100;

        // Ensure click is within image bounds (slightly tolerant)
        if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
            console.log("Click outside image bounds.");
            return;
        }


        pendingCommentCoords = { x: xPercent, y: yPercent };

        // Create a temporary marker
        pendingCommentMarker = document.createElement('div');
        pendingCommentMarker.className = 'comment-marker pending'; // Style differently
        pendingCommentMarker.textContent = '?';
        pendingCommentMarker.style.left = `${xPercent}%`;
        pendingCommentMarker.style.top = `${yPercent}%`;
        pendingCommentMarker.title = 'Adding comment here...';
        imageContainer.appendChild(pendingCommentMarker);

        // Show comment form
        commentForm.style.display = 'block';
        commentText.value = ''; // Clear previous text
        commentText.focus();
        commentMessage.textContent = ''; // Clear previous messages
    });

    submitComment.addEventListener('click', async () => {
        if (!pendingCommentCoords || !currentImageId) return;

        const text = commentText.value.trim();
        if (!text) {
            commentMessage.textContent = 'Comment text cannot be empty.';
            commentMessage.className = 'error';
            return;
        }

        commentMessage.textContent = 'Submitting...';
        commentMessage.className = '';

        try {
            const newComment = await fetchApi(`/api/comments/${currentImageId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x: pendingCommentCoords.x,
                    y: pendingCommentCoords.y,
                    text: text
                })
            });

            commentMessage.textContent = 'Comment added successfully!';
            commentMessage.className = 'success';

            // Reload comments to get the correct numbering and ensure consistency
            loadComments(currentImageId);
            clearPendingComment(); // Hide form, remove marker

        } catch (error) {
            commentMessage.textContent = `Error adding comment: ${error.message}`;
            commentMessage.className = 'error';
            // Keep the form open so user doesn't lose text
        }
    });

    cancelComment.addEventListener('click', () => {
        clearPendingComment();
    });

    function clearPendingComment() {
        if (pendingCommentMarker) {
            pendingCommentMarker.remove();
            pendingCommentMarker = null;
        }
        pendingCommentCoords = null;
        commentForm.style.display = 'none';
        commentText.value = '';
        commentMessage.textContent = '';
    }

    // --- Utility ---
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        // Corrected replacements
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }


    // --- Initialisation ---
    handleRouteChange(); // Load the correct view on page load

});