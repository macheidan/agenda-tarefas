import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/CalendarView.module.css';

const STATUS_CLASSES = {
  not_started: 'event-not-started',
  in_progress: 'event-in-progress',
  done: 'event-done',
};

export default function CalendarView({ tasks, onDateClick, onTaskClick }) {
  const events = tasks.map((task) => {
    const event = {
      id: task.id,
      title: task.title,
      start: task.date,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      classNames: [STATUS_CLASSES[task.status] || 'event-not-started'],
      extendedProps: { task },
    };

    if (task.finishDate && task.finishDate > task.date) {
      const endDate = new Date(task.finishDate + 'T12:00:00');
      endDate.setDate(endDate.getDate() + 1);
      event.end = endDate.toISOString().split('T')[0];
    }

    return event;
  });

  const renderEventContent = (eventInfo) => {
    const task = eventInfo.event.extendedProps.task;
    const time = task.endDate || null;

    return (
      <div className={styles.eventItem}>
        <span className={styles.eventIcon}>📄</span>
        <span className={styles.eventLabel}>{eventInfo.event.title}</span>
        {time && <span className={styles.eventTime}>{time}</span>}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="pt-br"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: '',
        }}
        events={events}
        eventContent={renderEventContent}
        dateClick={(info) => onDateClick(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onTaskClick(info.event.extendedProps.task);
        }}
        height="auto"
        dayMaxEvents={false}
        buttonText={{
          today: 'Hoje',
        }}
      />
    </div>
  );
}
