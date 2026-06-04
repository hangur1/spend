module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const PROJECT_ID = '1211763087952574';
  const PHASE_FIELD_GID = '1215397981889360';
  const CHANNEL_FIELD_GID = '1213107724210215';
  const FUNNEL_FIELD_GID = '1215407065572581';
  const STATUS_FIELD_GID = '1203697663505776';
  const DELIVERY_FIELD_GID = '1215397981894221';
  const token = process.env.ASANA_TOKEN;

  if (!token) return res.status(500).json({ error: 'ASANA_TOKEN not set' });

  const asanaFetch = (url) => fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  try {
    // 1. Fetch all top-level tasks
    let allTasks = [];
    let offset = null;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        project: PROJECT_ID,
        opt_fields: [
          'gid', 'name', 'completed',
          'custom_fields', 'custom_fields.gid', 'custom_fields.name',
          'custom_fields.enum_value', 'custom_fields.enum_value.name',
          'custom_fields.enum_value.gid', 'custom_fields.multi_enum_values',
          'custom_fields.multi_enum_values.name', 'custom_fields.multi_enum_values.gid',
          'due_on', 'start_on', 'memberships.section.name', 'tags', 'tags.name',
          'subtasks', 'subtasks.gid', 'subtasks.name'
        ].join(','),
        limit: '100',
      });
      if (offset) params.append('offset', offset);

      const response = await asanaFetch(`https://app.asana.com/api/1.0/tasks?${params}`);
      if (!response.ok) {
        const errText = await response.text();
        return res.status(200).json({ error: `Asana ${response.status}: ${errText}` });
      }
      const data = await response.json();
      allTasks = allTasks.concat(data.data || []);
      offset = data.next_page?.offset || null;
      hasMore = !!offset;
    }

    const filtered = allTasks.filter(task => {
      if (task.completed) return false;
      const phaseField = task.custom_fields?.find(f => f.gid === PHASE_FIELD_GID);
      return (phaseField?.multi_enum_values || []).length > 0;
    });

    // 2. Fetch subtask details in parallel (assignee + status + delivery + due)
    const subtaskGids = [];
    filtered.forEach(task => {
      (task.subtasks || []).forEach(st => subtaskGids.push(st.gid));
    });

    const subtaskFields = [
      'gid', 'name', 'completed', 'due_on',
      'assignee', 'assignee.name',
      'custom_fields', 'custom_fields.gid', 'custom_fields.name',
      'custom_fields.enum_value', 'custom_fields.enum_value.name',
    ].join(',');

    const subtaskDetails = {};
    // Batch in groups of 10 parallel fetches
    for (let i = 0; i < subtaskGids.length; i += 10) {
      const batch = subtaskGids.slice(i, i + 10);
      await Promise.all(batch.map(async (gid) => {
        try {
          const r = await asanaFetch(
            `https://app.asana.com/api/1.0/tasks/${gid}?opt_fields=${subtaskFields}`
          );
          if (r.ok) {
            const d = await r.json();
            subtaskDetails[gid] = d.data;
          }
        } catch (e) { /* skip */ }
      }));
    }

    // 3. Map tasks
    const tasks = filtered.map(task => {
      const phaseField = task.custom_fields?.find(f => f.gid === PHASE_FIELD_GID);
      const channelField = task.custom_fields?.find(f => f.gid === CHANNEL_FIELD_GID);
      const statusField = task.custom_fields?.find(f => f.gid === STATUS_FIELD_GID);
      const deliveryField = task.custom_fields?.find(f => f.gid === DELIVERY_FIELD_GID);
      const funnelField = task.custom_fields?.find(f => f.gid === FUNNEL_FIELD_GID);

      const subtasks = (task.subtasks || []).map(st => {
        const detail = subtaskDetails[st.gid];
        if (!detail) return { gid: st.gid, name: st.name, assignee: null, status: null, delivery: null, due_on: null, completed: false };
        const stStatus = detail.custom_fields?.find(f => f.gid === STATUS_FIELD_GID);
        const stDelivery = detail.custom_fields?.find(f => f.gid === DELIVERY_FIELD_GID);
        return {
          gid: detail.gid,
          name: detail.name,
          assignee: detail.assignee?.name || null,
          status: stStatus?.enum_value?.name || null,
          delivery: stDelivery?.enum_value?.name || null,
          due_on: detail.due_on || null,
          completed: detail.completed || false,
          url: `https://app.asana.com/0/${PROJECT_ID}/${detail.gid}`,
        };
      });

      return {
        gid: task.gid,
        name: task.name,
        phases: (phaseField?.multi_enum_values || []).map(v => v.name),
        channel: channelField?.enum_value?.name || null,
        funnel: funnelField?.enum_value?.name || null,
        status: statusField?.enum_value?.name || null,
        delivery: deliveryField?.enum_value?.name || null,
        section: task.memberships?.[0]?.section?.name || null,
        due_on: task.due_on || null,
        start_on: task.start_on || null,
        subtasks,
        url: `https://app.asana.com/0/${PROJECT_ID}/${task.gid}`,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ tasks });
  } catch (err) {
    return res.status(200).json({ error: err.message, stack: err.stack });
  }
};
