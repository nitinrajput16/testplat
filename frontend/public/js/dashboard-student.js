const token = localStorage.getItem('token');
let currentUser = null;

if (!token) {
    window.location.href = '/login';
}

try {
    currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
} catch (error) {
    console.error('Failed to parse currentUser from storage', error);
}

if (!currentUser || !currentUser.role) {
    window.location.href = '/login';
}

if (currentUser.role !== 'student') {
    window.location.href = '/dashboard-admin';
}

const API = {
    upcoming: '/api/exams/upcoming'
};

const welcomeMessage = document.getElementById('welcomeMessage');
const messageBox = document.getElementById('dashboardMessage');
const upcomingList = document.getElementById('upcomingExams');
const upcomingEmpty = document.getElementById('upcomingEmpty');
const readyExamCard = document.getElementById('readyExamCard');
const readyExamDetails = document.getElementById('readyExamDetails');
const readyExamEmpty = document.getElementById('readyExamEmpty');
const readyExamTitle = document.getElementById('readyExamTitle');
const readyExamSchedule = document.getElementById('readyExamSchedule');
const readyExamDescription = document.getElementById('readyExamDescription');
const readyExamAudience = document.getElementById('readyExamAudience');
const readyExamStartButton = document.getElementById('readyExamStart');
const readyExamAlreadyAttempted = document.getElementById('readyExamAlreadyAttempted');
const refreshUpcomingButton = document.getElementById('refreshUpcoming');

let cachedUpcoming = [];

function setWelcomeMessage() {
    if (!welcomeMessage) {
        return;
    }
    const roleLabel = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    welcomeMessage.textContent = `Logged in as ${currentUser.name || 'user'} (${roleLabel})`;
}

function setMessage(text, type = 'info', autoHide = true) {
    if (!messageBox) {
        return;
    }

    if (!text) {
        messageBox.classList.add('hidden');
        return;
    }

    messageBox.textContent = text;
    messageBox.classList.remove('hidden', 'info', 'error', 'success');
    messageBox.classList.add('alert', type);

    if (autoHide && type === 'success') {
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 2500);
    }
}

async function request(url, { method = 'GET', body } = {}) {
    const options = {
        method,
        headers: {
            Authorization: `Bearer ${token}`
        }
    };

    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('currentUser');
        window.location.href = '/login';
        throw new Error('Session expired. Please sign in again.');
    }

    if (response.status === 204) {
        return null;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = data.message || response.statusText || 'Request failed.';
        throw new Error(message);
    }

    return data;
}

function formatDate(value) {
    if (!value) {
        return 'TBA';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'TBA';
    }
    return date.toLocaleString();
}

function describeExamAudience(exam) {
    if (!exam) {
        return '';
    }

    const visibility = exam.visibility || 'public';
    const organizationNames = Array.isArray(exam.organizationTargets)
        ? exam.organizationTargets
            .map((organization) => {
                if (!organization) {
                    return '';
                }
                if (typeof organization === 'string') {
                    return organization;
                }
                return organization.name || organization.title || '';
            })
            .filter(Boolean)
        : [];
    const invitedEmails = Array.isArray(exam.invitedStudentEmails) ? exam.invitedStudentEmails : [];
    const invitedCountValue = Number(exam.invitedStudentEmailsCount);
    const emailCount = invitedEmails.length > 0
        ? invitedEmails.length
        : Number.isFinite(invitedCountValue) ? invitedCountValue : 0;
    const firstInvitedEmail = invitedEmails[0];

    switch (visibility) {
    case 'public':
        return 'Audience: all students';
    case 'organizations':
        return organizationNames.length
            ? `Audience: ${organizationNames.join(', ')}`
            : 'Audience: selected organizations';
    case 'custom':
        if (emailCount === 1 && firstInvitedEmail) {
            return `Audience: invited student ${firstInvitedEmail}`;
        }
        return emailCount ? `Audience: ${emailCount} invited students` : 'Audience: invited students';
    case 'mixed': {
        const parts = [];
        if (organizationNames.length) {
            parts.push(organizationNames.join(', '));
        }
        if (emailCount) {
            parts.push(`${emailCount} invited student${emailCount > 1 ? 's' : ''}`);
        }
        return parts.length ? `Audience: ${parts.join(' + ')}` : 'Audience: restricted';
    }
    default:
        return 'Audience: unspecified';
    }
}

function describeExamSchedule(exam) {
    if (!exam) {
        return 'Schedule: To be announced';
    }

    const startsAt = exam.startsAt ? formatDate(exam.startsAt) : null;
    const endsAt = exam.endsAt ? formatDate(exam.endsAt) : null;

    if (startsAt && endsAt) {
        return `Starts: ${startsAt} · Ends: ${endsAt}`;
    }

    if (startsAt) {
        return `Starts: ${startsAt}`;
    }

    if (endsAt) {
        return `Ends: ${endsAt}`;
    }

    return 'Schedule: To be announced';
}

function hasStudentAttemptedExam(exam) {
    if (!exam) {
        return false;
    }

    return Boolean(
        exam.hasSubmitted ||
        exam.hasSubmission ||
        exam.alreadySubmitted ||
        exam.submitted
    );
}

function storeExamMeta(exam) {
    if (!exam || !exam._id) {
        return;
    }

    const payload = {
        examId: exam._id,
        title: exam.title,
        schedule: describeExamSchedule(exam),
        description: exam.description,
        durationMinutes: exam.durationMinutes,
        storedAt: new Date().toISOString()
    };

    try {
        sessionStorage.removeItem(`exam-${exam._id}-progress`);
        sessionStorage.setItem('activeExamMeta', JSON.stringify(payload));
    } catch (error) {
        console.warn('Unable to store exam meta in session storage', error);
    }
}

function launchExam(examId) {
    if (!examId) {
        setMessage('Select a valid exam to begin.', 'error', false);
        return;
    }

    const exam = cachedUpcoming.find((item) => item._id === examId);
    if (!exam) {
        setMessage('We could not find that exam. Please refresh your list.', 'error', false);
        return;
    }

    if (hasStudentAttemptedExam(exam)) {
        setMessage('You have already submitted this exam.', 'info');
        return;
    }

    storeExamMeta(exam);
    window.location.href = `/home?examId=${encodeURIComponent(examId)}`;
}

function renderUpcomingExams() {
    if (!upcomingList) {
        return;
    }

    upcomingList.innerHTML = '';

    if (!cachedUpcoming.length) {
        upcomingEmpty?.classList.remove('hidden');
        renderReadyExamHighlight();
        return;
    }

    upcomingEmpty?.classList.add('hidden');

    cachedUpcoming.forEach((exam) => {
        const li = document.createElement('li');
        li.classList.toggle('attempted', hasStudentAttemptedExam(exam));

        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = exam.title;
        info.appendChild(title);

        const schedule = document.createElement('div');
        schedule.className = 'muted';
        schedule.textContent = describeExamSchedule(exam);
        info.appendChild(schedule);

        if (exam.description) {
            const description = document.createElement('div');
            description.className = 'muted';
            description.textContent = exam.description;
            info.appendChild(description);
        }

        li.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'actions-row';

        const startButton = document.createElement('button');
        startButton.type = 'button';
        startButton.dataset.action = 'start-exam';
        startButton.dataset.examId = exam._id;
        startButton.textContent = 'Start exam';

        if (hasStudentAttemptedExam(exam)) {
            startButton.disabled = true;
            startButton.textContent = 'Attempt recorded';
            startButton.classList.add('secondary');
        }

        actions.appendChild(startButton);
        li.appendChild(actions);

        upcomingList.appendChild(li);
    });

    renderReadyExamHighlight();
}

function renderReadyExamHighlight() {
    if (!readyExamCard) {
        return;
    }

    if (!cachedUpcoming.length) {
        readyExamDetails?.classList.add('hidden');
        readyExamEmpty?.classList.remove('hidden');
        readyExamAlreadyAttempted?.classList.add('hidden');
        if (readyExamStartButton) {
            readyExamStartButton.dataset.examId = '';
            readyExamStartButton.disabled = true;
            readyExamStartButton.textContent = 'Start exam';
        }
        return;
    }

    const exam = cachedUpcoming[0];

    if (readyExamTitle) {
        readyExamTitle.textContent = exam.title || 'Exam';
    }

    if (readyExamSchedule) {
        readyExamSchedule.textContent = describeExamSchedule(exam);
    }

    if (readyExamDescription) {
        readyExamDescription.textContent = exam.description || 'No description provided.';
    }

    if (readyExamAudience) {
        const audienceText = describeExamAudience(exam);
        if (audienceText) {
            readyExamAudience.textContent = audienceText;
            readyExamAudience.classList.remove('hidden');
        } else {
            readyExamAudience.classList.add('hidden');
        }
    }

    const alreadyAttempted = hasStudentAttemptedExam(exam);

    if (readyExamStartButton) {
        readyExamStartButton.dataset.examId = exam._id || '';
        readyExamStartButton.disabled = alreadyAttempted;
        readyExamStartButton.textContent = alreadyAttempted ? 'Attempt recorded' : 'Start exam';
    }

    readyExamAlreadyAttempted?.classList[alreadyAttempted ? 'remove' : 'add']('hidden');

    readyExamDetails?.classList.remove('hidden');
    readyExamEmpty?.classList.add('hidden');
}

async function fetchUpcoming() {
    try {
        const exams = await request(API.upcoming);
        cachedUpcoming = exams;
        renderUpcomingExams();
    } catch (error) {
        console.error(error);
        setMessage(error.message, 'error', false);
    }
}

upcomingList?.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) {
        return;
    }

    const { action, examId } = button.dataset;
    if (action === 'start-exam') {
        launchExam(examId);
    }
});

readyExamStartButton?.addEventListener('click', () => {
    if (readyExamStartButton.disabled) {
        return;
    }

    const examId = readyExamStartButton.dataset.examId;
    if (examId) {
        launchExam(examId);
    }
});

refreshUpcomingButton?.addEventListener('click', (event) => {
    event.preventDefault();
    fetchUpcoming();
});

function initialize() {
    setWelcomeMessage();
    fetchUpcoming();
}

initialize();
