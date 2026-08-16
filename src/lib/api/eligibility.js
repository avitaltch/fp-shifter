const pairKey = (left, right) => `${left}:${right}`;

function appendByKey(map, key, value) {
  const entries = map.get(key);
  if (entries) entries.push(value);
  else map.set(key, [value]);
}

export function createEligibilityIndex({ skills = [], availabilities = [], assignments = [] }) {
  const skillKeys = new Set(
    skills.map((skill) => pairKey(skill.user_id, skill.service_type_id))
  );
  const availabilityByUserDate = new Map();
  const assignmentsByUserDate = new Map();

  availabilities.forEach((availability) => {
    appendByKey(
      availabilityByUserDate,
      pairKey(availability.user_id, availability.available_date),
      availability
    );
  });
  assignments.forEach((assignment) => {
    appendByKey(
      assignmentsByUserDate,
      pairKey(assignment.user_id, assignment.work_date),
      assignment
    );
  });

  return { skillKeys, availabilityByUserDate, assignmentsByUserDate };
}

function hasSkill(userId, serviceTypeId, index) {
  return index.skillKeys.has(pairKey(userId, serviceTypeId));
}

function coversShift(userId, item, index) {
  const availabilities = index.availabilityByUserDate.get(pairKey(userId, item.work_date)) ?? [];
  return availabilities.some(
    (availability) =>
      availability.start_time <= item.start_time && availability.end_time >= item.end_time
  );
}

function conflictsWithShift(userId, item, index) {
  const assignments = index.assignmentsByUserDate.get(pairKey(userId, item.work_date)) ?? [];
  return assignments.some(
    (assignment) =>
      assignment.start_time < item.end_time && assignment.end_time > item.start_time
  );
}

// UI explanation only. The claim/assignment RPCs remain authoritative and
// repeat these checks transactionally to protect against stale data and races.
export function claimEligibility(
  item,
  userId,
  { skills, availabilities, assignments, eligibilityIndex }
) {
  const index = eligibilityIndex ?? createEligibilityIndex({ skills, availabilities, assignments });
  if (!hasSkill(userId, item.service_type_id, index)) {
    return { eligible: false, reason: 'NOT_QUALIFIED' };
  }
  if (!coversShift(userId, item, index)) {
    return { eligible: false, reason: 'NOT_AVAILABLE' };
  }
  if (conflictsWithShift(userId, item, index)) {
    return { eligible: false, reason: 'SHIFT_CONFLICT' };
  }
  return { eligible: true, reason: null };
}

export function eligibleEmployeesFor(
  item,
  { staff, skills, availabilities, assignments, eligibilityIndex }
) {
  const index = eligibilityIndex ?? createEligibilityIndex({ skills, availabilities, assignments });
  return staff.filter(
    (employee) =>
      claimEligibility(item, employee.id, {
        skills,
        availabilities,
        assignments,
        eligibilityIndex: index,
      }).eligible
  );
}
